/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

import { ServerComponent } from '../../../app/server/ServerComponent.js';
import { Log } from '../../../app/Log.js';

export class CoreStaticFileServerComponent extends ServerComponent
{
    directory;

    constructor(directory = 'public')
    {
        super();
        this.directory = directory;
    }

    get staticDirectory()
    {
        return path.resolve(this.server.baseDirectory, this.directory);
    }

    get fallbackDirectories()
    {
        return [
            'app',
            'core',
        ];
    }

    async start()
    {
        this.server.application.use(async (request, response, next) =>
        {
            try
            {
                const relativeFileName = request.path.replace(/^\/+/, '').replace(/\/$/, '/index.html') || 'index.html';
                const fileName = path.join(this.staticDirectory, relativeFileName);

                const result = await this.getStaticFile(fileName, request);

                if (result === null)
                {
                    next();
                    return;
                }

                response.type(path.extname(fileName)).send(result.content);
            }
            catch (error)
            {
                next(error);
            }
        });

        this.server.application.use(express.static(this.staticDirectory));
    }

    async getStaticFile(fileName, request)
    {
        Log.debug(`[CoreStaticFileServerComponent] ${request.path} => ${fileName}`);

        if (fileName.includes('.tpl.'))
        {
            const resolvedFileName = await this.resolveStaticFile(fileName, request);

            if (resolvedFileName === null)
            {
                return null;
            }

            let content = await fs.readFile(resolvedFileName, 'utf8');
            content = this._processVersionedContent(content, resolvedFileName, request);

            return { content };
        }

        const templateFileName = fileName.replace(/(\.[^./]+)$/, '.tpl$1');
        const resolvedTemplateFileName = await this.resolveStaticFile(templateFileName, request);

        if (resolvedTemplateFileName !== null)
        {
            let content = await fs.readFile(resolvedTemplateFileName, 'utf8');
            content = await this.processTemplate(content, resolvedTemplateFileName, request);
            content = this._processVersionedContent(content, resolvedTemplateFileName, request);

            return { content };
        }

        const resolvedFileName = await this.resolveStaticFile(fileName, request);

        if (resolvedFileName === null)
        {
            return null;
        }

        let content = await fs.readFile(resolvedFileName);
        content = this._processVersionedContent(content, resolvedFileName, request);

        return { content };
    }

    _processVersionedContent(content, fileName, request)
    {
        const version = request.query?.['appcore-version'];

        if (typeof version !== 'string')
        {
            return content;
        }

        const extension = path.extname(fileName).toLowerCase();

        if (!['.js', '.mjs', '.css', '.html', '.htm'].includes(extension))
        {
            return content;
        }

        let text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
        const addVersion = (url) => this._addVersionToUrl(url, version);

        if (extension === '.js' || extension === '.mjs')
        {
            text = text.replace(/(\b(?:import|export)\s+(?:[^'"\r\n]*?\s+from\s+)?)(['"])([^'"]+)\2/g, (match, prefix, quote, url) =>
            {
                return `${prefix}${quote}${addVersion(url)}${quote}`;
            });
            text = text.replace(/(\bimport\s*\(\s*)(['"])([^'"]+)\2/g, (match, prefix, quote, url) =>
            {
                return `${prefix}${quote}${addVersion(url)}${quote}`;
            });
        }
        else if (extension === '.css')
        {
            text = text.replace(/(@import\s+)(['"])([^'"]+)\2/g, (match, prefix, quote, url) =>
            {
                return `${prefix}${quote}${addVersion(url)}${quote}`;
            });
            text = text.replace(/(url\(\s*)(['"]?)([^'"\)]+)\2(\s*\))/g, (match, prefix, quote, url, suffix) =>
            {
                return `${prefix}${quote}${addVersion(url.trim())}${quote}${suffix}`;
            });
        }
        else if (extension === '.html' || extension === '.htm')
        {
            text = text.replace(/(\b(?:src|href|poster)\s*=\s*)(['"])([^'"]+)\2/gi, (match, prefix, quote, url) =>
            {
                return `${prefix}${quote}${addVersion(url)}${quote}`;
            });
            text = text.replace(/(\bsrcset\s*=\s*)(['"])([^'"]+)\2/gi, (match, prefix, quote, value) =>
            {
                const versionedValue = value.split(',').map((candidate) =>
                {
                    const parts = candidate.trim().split(/\s+/);
                    parts[0] = addVersion(parts[0]);
                    return parts.join(' ');
                }).join(', ');

                return `${prefix}${quote}${versionedValue}${quote}`;
            });
        }

        return text;
    }

    _addVersionToUrl(value, version)
    {
        if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value))
        {
            return value;
        }

        const hashIndex = value.indexOf('#');
        const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
        const valueWithoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
        const queryIndex = valueWithoutHash.indexOf('?');
        const pathname = queryIndex === -1 ? valueWithoutHash : valueWithoutHash.slice(0, queryIndex);
        const searchParams = new URLSearchParams(queryIndex === -1 ? '' : valueWithoutHash.slice(queryIndex + 1));

        if (searchParams.has('appcore-version'))
        {
            return value;
        }

        searchParams.set('appcore-version', version);

        return `${pathname}?${searchParams}${hash}`;
    }

    async resolveStaticFile(fileName, request)
    {
        try
        {
            await fs.access(fileName);
            return fileName;
        }
        catch
        {
            return await this.resolveFallbackStaticFile(fileName, request);
        }
    }

    async resolveFallbackStaticFile(fileName, request)
    {
        let relativeFileName = path.relative(this.staticDirectory, fileName).replaceAll('\\', '/');

        if (relativeFileName.startsWith('core/'))
        {
            return null;
        }

        let fallbackDirectories = this.fallbackDirectories;

        if (relativeFileName.startsWith('app/'))
        {
            relativeFileName = relativeFileName.replace(/^app\//, '');

            fallbackDirectories = [
                'core',
            ];
        }

        for (const fallbackDirectory of fallbackDirectories)
        {
            const fallbackFileName = path.join(this.staticDirectory, fallbackDirectory, relativeFileName);

            try
            {
                await fs.access(fallbackFileName);

                Log.debug(`[CoreStaticFileServerComponent] ${request.path} => ${fileName} => ${fallbackFileName}`);

                return fallbackFileName;
            }
            catch
            {
            }
        }

        return null;
    }

    async processTemplate(content, fileName, request)
    {
        return content;
    }
}