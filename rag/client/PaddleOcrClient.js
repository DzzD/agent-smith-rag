import { PaddleVisionClient } from './PaddleVisionClient.js';
import { Log } from '../../app/Log.js';

export class PaddleOcrClient
{
    constructor({ paddleUrl = 'http://127.0.0.1:8080', paddleApiKey = '', visionImageDirectory = '' } = {})
    {
        this.paddleUrl = paddleUrl;
        this.paddleApiKey = paddleApiKey;
        this.vision = new PaddleVisionClient({ imageDirectory: visionImageDirectory });
    }

    async analyze(image, { mimeType = 'image/png', visionImage = image, visionMimeType = mimeType, coordinateScaleX = 1, coordinateScaleY = 1,
        visionCoordinateScaleX = coordinateScaleX, visionCoordinateScaleY = coordinateScaleY, lineSpacingFactor = 0.75,
        horizontalOverlapFactor = 0.75, readingOrderAlignmentTolerance = 0.02, readingOrderHorizontalOverlapFactor = 0.5,
        readingOrderRowTolerance = 0.02, maximumEmptyToBlockRatio = 4, pageWidth, pageHeight, paddleMaxAttempts = 3, logContext } = {})
    {
        const analysisStartedAt = performance.now();
        let lines;

        for (let attempt = 1; attempt <= paddleMaxAttempts; attempt += 1)
        {
            const attemptStartedAt = performance.now();

            try
            {
                lines = await this._extractLines(image, logContext);
                Log.debug(`[PaddleOCR][timing] Extraction attempt ${attempt}/${paddleMaxAttempts}: ${this._elapsed(attemptStartedAt)} ms; lines=${lines.length}.`);
                break;
            }
            catch (error)
            {
                Log.warn(`[PaddleOCR][timing] Extraction attempt ${attempt}/${paddleMaxAttempts} failed after ${this._elapsed(attemptStartedAt)} ms: ${error.message}`);

                if (attempt === paddleMaxAttempts || !(error instanceof TypeError))
                {
                    throw error;
                }
            }
        }

        const groupingStartedAt = performance.now();
        const groups = this._groupLines(lines, { lineSpacingFactor, horizontalOverlapFactor });
        Log.debug(`[PaddleOCR][timing] Grouping: ${this._elapsed(groupingStartedAt)} ms; groups=${groups.length}.`);
        const orderStartedAt = performance.now();
        const mergedGroups = [];
        const orderedBlocks = this._orderBlocks(groups, {
            pageWidth: pageWidth ?? Math.max(1, ...groups.map((group) => group.box[2])),
            pageHeight: pageHeight ?? Math.max(1, ...groups.map((group) => group.box[3])),
            alignmentTolerance: readingOrderAlignmentTolerance,
            horizontalOverlapFactor: readingOrderHorizontalOverlapFactor,
            rowTolerance: readingOrderRowTolerance,
            maximumEmptyToBlockRatio,
            mergedGroups,
        });
        Log.debug(`[PaddleOCR][timing] Deterministic order: ${this._elapsed(orderStartedAt)} ms.`);
        const finalBlocks = orderedBlocks.map((block, index) => ({
            ...block,
            id: `B${String(index + 1).padStart(3, '0')}`,
            type: 'text',
        }));
        const scaleBoxes = (items) => items.map((item) => ({ ...item, box: [item.box[0] * visionCoordinateScaleX,
            item.box[1] * visionCoordinateScaleY, item.box[2] * visionCoordinateScaleX, item.box[3] * visionCoordinateScaleY] }));
        await this.vision.saveRawOcrBlocksImage({ image: visionImage, blocks: scaleBoxes(lines), logContext });
        await this.vision.saveLineGroupsImage({ image: visionImage, groups: scaleBoxes(groups), logContext });
        await this.vision.saveGroupsBeforeFlatteningImage({
            image: visionImage,
            groups: scaleBoxes(mergedGroups),
            logContext,
        });
        await this.vision.saveResultImage({
            image: visionImage,
            blocks: scaleBoxes(finalBlocks),
            logContext,
        });
        Log.debug(`[PaddleOCR][timing] Total analysis: ${this._elapsed(analysisStartedAt)} ms; deterministicOrder=true.`);

        return {
            markdown: `${finalBlocks.map((block) => block.text).join('\n\n')}\n`,
            blocks: finalBlocks.map((block) => ({
                id: block.id,
                type: block.type,
                content: block.text,
                pageMinX: Math.round(block.box[0] * coordinateScaleX),
                pageMinY: Math.round(block.box[1] * coordinateScaleY),
                pageMaxX: Math.round(block.box[2] * coordinateScaleX),
                pageMaxY: Math.round(block.box[3] * coordinateScaleY),
            })),
        };
    }

    async _extractLines(image, logContext)
    {
        const serializationStartedAt = performance.now();
        const requestBody = JSON.stringify({ file: image.toString('base64'), fileType: 1, useDocOrientationClassify: false,
            useDocUnwarping: false, useTextlineOrientation: false, visualize: false });
        Log.debug(`[PaddleOCR][timing] Request serialization: ${this._elapsed(serializationStartedAt)} ms; PNG=${image.length} bytes, JSON=${requestBody.length} chars.`);
        const requestStartedAt = performance.now();
        Log.info(`[OCR] Call: ${this._formatLogTarget(logContext)}.`);
        const response = await fetch(new URL('/ocr', this.paddleUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.paddleApiKey ? { Authorization: `Bearer ${this.paddleApiKey}` } : {}),
            },
            body: requestBody,
        });
        Log.debug(`[PaddleOCR][timing] HTTP response: ${this._elapsed(requestStartedAt)} ms; status=${response.status}.`);
        const parsingStartedAt = performance.now();
        const body = await response.json();
        Log.debug(`[PaddleOCR][timing] Response parsing: ${this._elapsed(parsingStartedAt)} ms.`);

        if (!response.ok || body.errorCode !== 0)
        {
            throw new Error(`PaddleOCR failed (${response.status}): ${body.errorMsg ?? response.statusText}`);
        }

        const page = body.result?.ocrResults?.[0]?.prunedResult;

        if (!page || !Array.isArray(page.rec_texts))
        {
            throw new Error('PaddleOCR failed: no OCR page returned.');
        }

        return page.rec_texts.map((text, index) => ({
            id: `L${String(index + 1).padStart(3, '0')}`,
            text,
            score: page.rec_scores[index],
            box: page.rec_boxes[index],
        }));
    }

    _formatLogTarget(logContext = {})
    {
        const page = logContext.pageNumber ? `page ${logContext.pageNumber}${logContext.pageCount ? `/${logContext.pageCount}` : ''}` : 'document';
        return `${logContext.fileName ?? 'unknown file'}, ${page}`;
    }

    _groupLines(lines, { lineSpacingFactor, horizontalOverlapFactor })
    {
        const getGeometry = (line) =>
        {
            const [left, top, right, bottom] = line.box;
            return { left, top, right, bottom, height: bottom - top };
        };
        const horizontalOverlapRatio = (first, second) =>
        {
            const overlap = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
            const shortestWidth = Math.min(first.right - first.left, second.right - second.left);
            return shortestWidth === 0 ? 0 : overlap / shortestWidth;
        };
        const isCompatibleGroup = (firstGroup, secondGroup) =>
        {
            const upperGroup = firstGroup.top <= secondGroup.top ? firstGroup : secondGroup;
            const lowerGroup = upperGroup === firstGroup ? secondGroup : firstGroup;
            const upperLine = upperGroup.lines.reduce((lowest, line) => line.geometry.bottom > lowest.geometry.bottom ? line : lowest);
            const lowerLine = lowerGroup.lines.reduce((highest, line) => line.geometry.top < highest.geometry.top ? line : highest);
            const upperCenterY = (upperLine.geometry.top + upperLine.geometry.bottom) / 2;
            const lowerCenterY = (lowerLine.geometry.top + lowerLine.geometry.bottom) / 2;
            const averageHeight = (upperLine.geometry.height + lowerLine.geometry.height) / 2;
            return lowerCenterY - upperCenterY <= averageHeight * (1 + lineSpacingFactor)
                && horizontalOverlapRatio(upperLine.geometry, lowerLine.geometry) >= horizontalOverlapFactor;
        };
        const buildGroup = (groupLines) => ({
            lines: groupLines,
            left: Math.min(...groupLines.map((line) => line.geometry.left)),
            top: Math.min(...groupLines.map((line) => line.geometry.top)),
            right: Math.max(...groupLines.map((line) => line.geometry.right)),
            bottom: Math.max(...groupLines.map((line) => line.geometry.bottom)),
        });
        const splitIrregularSpacing = (group) =>
        {
            const sortedLines = group.lines.sort((first, second) => first.geometry.top - second.geometry.top
                || first.geometry.left - second.geometry.left);

            if (sortedLines.length < 5)
            {
                return [group];
            }

            const spacings = sortedLines.slice(1).map((line, index) =>
            {
                const previousLine = sortedLines[index];
                const previousCenterY = (previousLine.geometry.top + previousLine.geometry.bottom) / 2;
                const centerY = (line.geometry.top + line.geometry.bottom) / 2;
                const averageHeight = (previousLine.geometry.height + line.geometry.height) / 2;
                return (centerY - previousCenterY) / averageHeight;
            });
            const orderedSpacings = [...spacings].sort((first, second) => first - second);
            const middleIndex = Math.floor(orderedSpacings.length / 2);
            const medianSpacing = orderedSpacings.length % 2 === 0
                ? (orderedSpacings[middleIndex - 1] + orderedSpacings[middleIndex]) / 2
                : orderedSpacings[middleIndex];
            const fragments = [];
            let fragmentLines = [sortedLines[0]];

            for (let index = 0; index < spacings.length; index += 1)
            {
                if (spacings[index] > medianSpacing * 1.35)
                {
                    fragments.push(buildGroup(fragmentLines));
                    fragmentLines = [];
                }

                fragmentLines.push(sortedLines[index + 1]);
            }

            fragments.push(buildGroup(fragmentLines));
            return fragments;
        };
        const groups = lines.map((line, index) =>
        {
            const geometry = getGeometry(line);
            return { lines: [{ ...line, index, geometry }], left: geometry.left, top: geometry.top, right: geometry.right, bottom: geometry.bottom };
        });
        let merged = true;

        while (merged)
        {
            merged = false;

            for (let firstIndex = 0; firstIndex < groups.length && !merged; firstIndex += 1)
            {
                for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1)
                {
                    const canMerge = isCompatibleGroup(groups[firstIndex], groups[secondIndex]);

                    if (!canMerge)
                    {
                        continue;
                    }

                    const firstGroup = groups[firstIndex];
                    const secondGroup = groups[secondIndex];
                    firstGroup.lines.push(...secondGroup.lines);
                    firstGroup.left = Math.min(firstGroup.left, secondGroup.left);
                    firstGroup.top = Math.min(firstGroup.top, secondGroup.top);
                    firstGroup.right = Math.max(firstGroup.right, secondGroup.right);
                    firstGroup.bottom = Math.max(firstGroup.bottom, secondGroup.bottom);
                    groups.splice(secondIndex, 1);
                    merged = true;
                    break;
                }
            }
        }

        const splitGroups = groups.flatMap(splitIrregularSpacing);

        for (let containedIndex = splitGroups.length - 1; containedIndex >= 0; containedIndex -= 1)
        {
            const containedGroup = splitGroups[containedIndex];
            const containedWidth = containedGroup.right - containedGroup.left;
            const containedHeight = containedGroup.bottom - containedGroup.top;
            const containedArea = containedWidth * containedHeight;
            const containerIndex = splitGroups.findIndex((containerGroup, index) =>
            {
                if (index === containedIndex || containedArea <= 0)
                {
                    return false;
                }

                const containerArea = (containerGroup.right - containerGroup.left) * (containerGroup.bottom - containerGroup.top);
                const overlapWidth = Math.max(0, Math.min(containerGroup.right, containedGroup.right)
                    - Math.max(containerGroup.left, containedGroup.left));
                const overlapHeight = Math.max(0, Math.min(containerGroup.bottom, containedGroup.bottom)
                    - Math.max(containerGroup.top, containedGroup.top));
                return containerArea > containedArea && overlapWidth * overlapHeight / containedArea >= 0.95;
            });

            if (containerIndex === -1)
            {
                continue;
            }

            splitGroups[containerIndex] = buildGroup([...splitGroups[containerIndex].lines, ...containedGroup.lines]
                .sort((first, second) => first.index - second.index));
            splitGroups.splice(containedIndex, 1);
        }

        return splitGroups.map((group, groupIndex) =>
        {
            const sortedLines = group.lines.sort((first, second) => first.index - second.index);
            return {
                id: `G${String(groupIndex + 1).padStart(3, '0')}`,
                text: sortedLines.map((line) => line.text).join('\n'),
                box: [group.left, group.top, group.right, group.bottom],
            };
        });
    }

    _orderBlocks(blocks, { pageWidth, pageHeight, alignmentTolerance, horizontalOverlapFactor, rowTolerance, mergedGroups,
        maximumEmptyToBlockRatio = 4 })
    {
        if (blocks.length === 0)
        {
            return [];
        }

        const horizontalTolerance = pageWidth * alignmentTolerance;
        const verticalTolerance = pageHeight * alignmentTolerance;
        const collisionMarginX = pageWidth * 0.002;
        const collisionMarginY = pageHeight * 0.002;
        const groups = blocks.map((block, inputIndex) => ({ blocks: [{ block, inputIndex }], box: [...block.box], inputIndex }));
        const compareNumbers = (first, second) =>
        {
            for (let index = 0; index < first.length; index += 1)
            {
                if (first[index] !== second[index])
                {
                    return first[index] - second[index];
                }
            }

            return 0;
        };
        const intersectionArea = (...boxes) =>
        {
            const width = Math.max(0, Math.min(...boxes.map((box) => box[2])) - Math.max(...boxes.map((box) => box[0])));
            const height = Math.max(0, Math.min(...boxes.map((box) => box[3])) - Math.max(...boxes.map((box) => box[1])));
            return width * height;
        };
        const getMergeCandidate = (first, second, firstIndex, secondIndex) =>
        {
            const upperGroup = compareNumbers([first.box[1], first.box[0], first.inputIndex],
                [second.box[1], second.box[0], second.inputIndex]) <= 0 ? first : second;
            const lowerGroup = upperGroup === first ? second : first;
            const upperBlock = upperGroup.blocks.at(-1).block;
            const lowerBlock = lowerGroup.blocks[0].block;
            const firstWidth = upperBlock.box[2] - upperBlock.box[0];
            const secondWidth = lowerBlock.box[2] - lowerBlock.box[0];
            const overlap = Math.min(upperBlock.box[2], lowerBlock.box[2]) - Math.max(upperBlock.box[0], lowerBlock.box[0]);

            if (overlap <= 0 || firstWidth <= 0 || secondWidth <= 0
                || overlap / Math.min(firstWidth, secondWidth) < horizontalOverlapFactor)
            {
                return null;
            }

            const leftAligned = Math.abs(upperBlock.box[0] - lowerBlock.box[0]) <= horizontalTolerance;
            const rightAligned = Math.abs(upperBlock.box[2] - lowerBlock.box[2]) <= horizontalTolerance;
            const firstCenter = (upperBlock.box[0] + upperBlock.box[2]) / 2;
            const secondCenter = (lowerBlock.box[0] + lowerBlock.box[2]) / 2;

            if (!leftAligned && !rightAligned && Math.abs(firstCenter - secondCenter) > horizontalTolerance)
            {
                return null;
            }

            const mergedBox = [Math.min(first.box[0], second.box[0]), Math.min(first.box[1], second.box[1]),
                Math.max(first.box[2], second.box[2]), Math.max(first.box[3], second.box[3])];
            const lowerHeight = lowerGroup.box[3] - lowerGroup.box[1];
            const emptyAddedHeight = Math.max(0, lowerGroup.box[1] - upperGroup.box[3]);
            const emptyToBlockRatio = lowerHeight > 0 ? emptyAddedHeight / lowerHeight : Number.POSITIVE_INFINITY;

            if (emptyToBlockRatio > maximumEmptyToBlockRatio)
            {
                return null;
            }

            for (let otherIndex = 0; otherIndex < groups.length; otherIndex += 1)
            {
                if (otherIndex === firstIndex || otherIndex === secondIndex)
                {
                    continue;
                }

                const otherBox = groups[otherIndex].box;
                const overlapWidth = Math.max(0, Math.min(mergedBox[2], otherBox[2]) - Math.max(mergedBox[0], otherBox[0]));
                const overlapHeight = Math.max(0, Math.min(mergedBox[3], otherBox[3]) - Math.max(mergedBox[1], otherBox[1]));
                const introducedOverlapArea = intersectionArea(mergedBox, otherBox) - intersectionArea(first.box, otherBox)
                    - intersectionArea(second.box, otherBox) + intersectionArea(first.box, second.box, otherBox);

                if (overlapWidth > collisionMarginX && overlapHeight > collisionMarginY
                    && introducedOverlapArea > collisionMarginX * collisionMarginY)
                {
                    return null;
                }
            }

            return { mergedBox, emptyToBlockRatio };
        };

        while (true)
        {
            let bestPair = null;

            for (let firstIndex = 0; firstIndex < groups.length; firstIndex += 1)
            {
                for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1)
                {
                    const first = groups[firstIndex];
                    const second = groups[secondIndex];
                    const candidate = getMergeCandidate(first, second, firstIndex, secondIndex);

                    if (!candidate)
                    {
                        continue;
                    }

                    const distance = Math.max(0, Math.max(first.box[1], second.box[1]) - Math.min(first.box[3], second.box[3]));
                    const tieBreak = [candidate.emptyToBlockRatio, distance, Math.min(first.box[1], second.box[1]), Math.min(first.box[0], second.box[0]),
                        Math.min(first.inputIndex, second.inputIndex), Math.max(first.inputIndex, second.inputIndex)];

                    if (!bestPair || compareNumbers(tieBreak, bestPair.tieBreak) < 0)
                    {
                        bestPair = { firstIndex, secondIndex, mergedBox: candidate.mergedBox, tieBreak };
                    }
                }
            }

            if (!bestPair)
            {
                break;
            }

            const first = groups[bestPair.firstIndex];
            const second = groups[bestPair.secondIndex];
            const orderedPair = [first, second].sort((firstGroup, secondGroup) => compareNumbers(
                [firstGroup.box[1], firstGroup.box[0], firstGroup.inputIndex],
                [secondGroup.box[1], secondGroup.box[0], secondGroup.inputIndex]));
            groups[bestPair.firstIndex] = {
                blocks: orderedPair.flatMap((group) => group.blocks),
                box: bestPair.mergedBox,
                inputIndex: Math.min(first.inputIndex, second.inputIndex),
            };
            groups.splice(bestPair.secondIndex, 1);
        }

        if (mergedGroups)
        {
            const layoutRows = [];
            const groupsByPosition = [...groups].sort((first, second) => compareNumbers(
                [first.box[1], first.box[0], first.inputIndex],
                [second.box[1], second.box[0], second.inputIndex]));

            for (const group of groupsByPosition)
            {
                const matchingRow = layoutRows.find((row) => row.some((member) =>
                {
                    const overlap = Math.max(0, Math.min(group.box[3], member.box[3]) - Math.max(group.box[1], member.box[1]));
                    const smallestHeight = Math.min(group.box[3] - group.box[1], member.box[3] - member.box[1]);
                    return smallestHeight > 0 && overlap / smallestHeight >= 0.5;
                }));

                if (matchingRow)
                {
                    matchingRow.push(group);
                }
                else
                {
                    layoutRows.push([group]);
                }
            }

            const positions = new Map();
            layoutRows.forEach((row, rowIndex) =>
            {
                row.sort((first, second) => compareNumbers(
                    [first.box[0], first.box[1], first.inputIndex],
                    [second.box[0], second.box[1], second.inputIndex]));
                row.forEach((group, columnIndex) => positions.set(group, { row: rowIndex + 1, column: columnIndex + 1 }));
            });
            mergedGroups.push(...groups.map((group) => ({
                id: group.blocks.map(({ block }) => block.id).join('+'),
                box: [...group.box],
                ...positions.get(group),
            })));
        }

        const outgoing = groups.map(() => new Set());
        const incomingCount = groups.map(() => 0);
        const comparePosition = (firstIndex, secondIndex) => compareNumbers(
            [groups[firstIndex].box[1], groups[firstIndex].box[0], groups[firstIndex].inputIndex],
            [groups[secondIndex].box[1], groups[secondIndex].box[0], groups[secondIndex].inputIndex]);
        const hasPath = (fromIndex, toIndex) =>
        {
            const pending = [fromIndex];
            const visited = new Set();

            while (pending.length > 0)
            {
                const currentIndex = pending.pop();

                if (currentIndex === toIndex)
                {
                    return true;
                }

                if (!visited.has(currentIndex))
                {
                    visited.add(currentIndex);
                    pending.push(...outgoing[currentIndex]);
                }
            }

            return false;
        };
        const addPrecedence = (beforeIndex, afterIndex) =>
        {
            if (!outgoing[beforeIndex].has(afterIndex) && !hasPath(afterIndex, beforeIndex))
            {
                outgoing[beforeIndex].add(afterIndex);
                incomingCount[afterIndex] += 1;
            }
        };

        const horizontalPrecedences = [];

        for (let firstIndex = 0; firstIndex < groups.length; firstIndex += 1)
        {
            for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1)
            {
                const first = groups[firstIndex];
                const second = groups[secondIndex];
                const firstIsAbove = first.box[3] <= second.box[1];
                const secondIsAbove = second.box[3] <= first.box[1];

                if (firstIsAbove || secondIsAbove)
                {
                    const beforeIndex = firstIsAbove ? firstIndex : secondIndex;
                    const afterIndex = firstIsAbove ? secondIndex : firstIndex;
                    outgoing[beforeIndex].add(afterIndex);
                    incomingCount[afterIndex] += 1;
                }
            }
        }

        for (let firstIndex = 0; firstIndex < groups.length; firstIndex += 1)
        {
            for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1)
            {
                const first = groups[firstIndex];
                const second = groups[secondIndex];
                const firstHeight = first.box[3] - first.box[1];
                const secondHeight = second.box[3] - second.box[1];
                const horizontalOverlap = Math.max(0, Math.min(first.box[2], second.box[2]) - Math.max(first.box[0], second.box[0]));
                const verticalOverlap = Math.max(0, Math.min(first.box[3], second.box[3]) - Math.max(first.box[1], second.box[1]));
                const smallestHeight = Math.min(firstHeight, secondHeight);
                const largestHeight = Math.max(firstHeight, secondHeight);
                const overlapRatio = smallestHeight > 0 ? verticalOverlap / smallestHeight : 0;

                if (overlapRatio < rowTolerance)
                {
                    continue;
                }

                const startsAtSameLevel = Math.abs(first.box[1] - second.box[1]) <= verticalTolerance;
                const comparableHeightRatio = largestHeight > 0 ? smallestHeight / largestHeight : 0;
                const areStronglyOverlappingColumns = horizontalOverlap === 0 && overlapRatio >= 0.5 && comparableHeightRatio >= 0.5;
                const positionComparison = areStronglyOverlappingColumns || (horizontalOverlap === 0 && startsAtSameLevel)
                    ? compareNumbers([first.box[0], first.box[1], first.inputIndex], [second.box[0], second.box[1], second.inputIndex])
                    : compareNumbers([first.box[1], first.box[0], first.inputIndex], [second.box[1], second.box[0], second.inputIndex]);
                const beforeIndex = positionComparison <= 0 ? firstIndex : secondIndex;
                const afterIndex = beforeIndex === firstIndex ? secondIndex : firstIndex;
                horizontalPrecedences.push({ beforeIndex, afterIndex });
            }
        }

        horizontalPrecedences.sort((first, second) => compareNumbers(
            [...groups[first.beforeIndex].box, ...groups[first.afterIndex].box],
            [...groups[second.beforeIndex].box, ...groups[second.afterIndex].box]));

        for (const { beforeIndex, afterIndex } of horizontalPrecedences)
        {
            addPrecedence(beforeIndex, afterIndex);
        }

        const remaining = new Set(groups.map((group, index) => index));
        const orderedGroups = [];

        while (remaining.size > 0)
        {
            const available = [...remaining].filter((index) => incomingCount[index] === 0).sort(comparePosition);
            const nextIndex = available[0];
            remaining.delete(nextIndex);
            orderedGroups.push(groups[nextIndex]);

            for (const afterIndex of outgoing[nextIndex])
            {
                incomingCount[afterIndex] -= 1;
            }
        }

        return orderedGroups.flatMap((group) => group.blocks.map(({ block }) => block));
    }

    _stripMarkdown(markdown)
    {
        return markdown.replace(/^\s*(?:#{1,6}|[-*+] |\d+\. )/gm, '').replace(/[*_`|]/g, '').replace(/\s+/g, ' ').trim();
    }

    _elapsed(startedAt)
    {
        return (performance.now() - startedAt).toFixed(1);
    }

}