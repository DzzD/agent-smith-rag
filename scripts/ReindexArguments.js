export function parseReindexArguments(argumentsList)
{
	const force = argumentsList.includes('--force');
	const all = argumentsList.includes('--all');
	const storedPageImages = argumentsList.includes('--stored-page-images');
	const maxPagesIndex = argumentsList.indexOf('--max-pages');
	const maxPagesValue = maxPagesIndex === -1 ? null : argumentsList[maxPagesIndex + 1];
	const maxPages = maxPagesValue === null ? null : Number(maxPagesValue);
	const consumedIndexes = new Set(maxPagesIndex === -1 ? [] : [maxPagesIndex, maxPagesIndex + 1]);
	const documentUuids = [...new Set(argumentsList.filter((argument, index) => !argument.startsWith('--') && !consumedIndexes.has(index)))];
	const unknownOptions = argumentsList.filter((argument) => argument.startsWith('--')
		&& !['--all', '--force', '--max-pages', '--stored-page-images'].includes(argument));

	if (unknownOptions.length > 0)
	{
		throw new Error(`Unknown option: ${unknownOptions[0]}.`);
	}

	if (all && documentUuids.length > 0)
	{
		throw new Error('--all cannot be combined with document UUIDs.');
	}

	if (maxPagesIndex !== -1 && (!Number.isInteger(maxPages) || maxPages <= 0))
	{
		throw new Error('--max-pages must be followed by a positive integer.');
	}

	return { force, all: all || documentUuids.length === 0, documentUuids, maxPages, storedPageImages };
}