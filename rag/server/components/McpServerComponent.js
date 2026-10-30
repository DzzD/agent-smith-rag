import { ServerComponent } from '../../../app/server/ServerComponent.js';
import { Document } from '../../../app/db/models/Document.js';
import { DocumentPage } from '../../../app/db/models/DocumentPage.js';
import { DbQueryAuthenticatedBearer } from '../../../app/db/queries/DbQueryAuthenticatedBearer.js';
import { Log } from '../../../app/Log.js';

const tools = [
  {
    name: 'document_add',
    description: 'Add and index a visual document in an authorized domain. An optional user description provides context for the generated description.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            dataBase64: { type: 'string' },
          },
          required: ['name', 'dataBase64'],
          additionalProperties: false,
        },
        domain: {
          type: 'string',
          description: 'Stable domain identifier, for example RH or DSI.',
        },
        description: {
          type: 'string',
          description: 'Optional context supplied by the user, especially useful for images or files extracted from another document.',
        },
      },
      required: ['file', 'domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'document_list',
    description: 'List authorized documents with basic metadata, optional case-insensitive regular-expression name filtering, and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', default: '', description: 'Case-insensitive regular expression matched against the document name. Empty lists all documents.' },
        pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Number of documents per page. Defaults to 50.' },
        pageNumber: { type: 'integer', minimum: 1, default: 1, description: 'One-based page number. Page 2 with pageSize 50 returns results 50 through 99.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'document_search',
    description: 'Search documents semantically, lexically, or with both modes fused by Reciprocal Rank Fusion (RRF).',
    inputSchema: {
      type: 'object',
      properties: {
        semanticQuery: { type: 'string', description: 'Natural-language meaning to search through embeddings.' },
        lexicalQuery: { type: 'string', description: 'Terms to find with PostgreSQL web-search syntax, such as "Bruno Augier" or budget OR finance.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Maximum number of chunk matches. Defaults to 10.' },
        minimumScoreRatio: { type: 'number', minimum: 0, maximum: 1, default: 0.8,
          description: 'Relative cluster-score cutoff. Lower values return broader results; higher values return fewer, more precise results.' },
      },
      required: [],
      anyOf: [
        { required: ['semanticQuery'] },
        { required: ['lexicalQuery'] },
      ],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uuid: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              domain: { type: 'string' },
              score: { type: 'number' },
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    uuid: { type: 'string', format: 'uuid' },
                    pageNumber: { type: 'integer' },
                    description: { type: ['string', 'null'] },
                    score: { type: 'number' },
                    chunks: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['uuid', 'pageNumber', 'description', 'score', 'chunks'],
                  additionalProperties: false,
                },
              },
            },
            required: ['uuid', 'name', 'description', 'domain', 'score', 'pages'],
            additionalProperties: false,
          },
        },
      },
      required: ['documents'],
      additionalProperties: false,
    },
  },
  {
    name: 'document_get',
    description: 'Get authorized documents and selected pages. Blocks use page-pixel x, y, width, and height coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          minItems: 1,
          description: 'Documents to retrieve in one call.',
          items: {
            type: 'object',
            properties: {
              documentUuid: { type: 'string', format: 'uuid' },
              pageNumbers: {
                type: 'array',
                items: { type: 'integer', minimum: 1 },
              },
            },
            required: ['documentUuid'],
            additionalProperties: false,
          },
        },
        documentUuid: {
          type: 'string',
          format: 'uuid',
          description: 'Legacy single-document input. Prefer documents for one or more documents.',
        },
        pageNumbers: {
          type: 'array',
          items: {
            type: 'integer',
            minimum: 1,
          },
        },
        includeOriginal: {
          type: 'boolean',
          default: false,
        },
        includePageImages: {
          type: 'boolean',
          default: true,
          description: 'Return rendered page images; false enables lightweight retrieval.',
        },
        pageImageDpi: {
          type: 'integer',
          minimum: 1,
          default: 100,
          description: 'Maximum page-image DPI. Images are never upscaled; block x, y, width, and height match the returned raster.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'page_highlight',
    description: 'Calculate normalized highlight bounding boxes for one or more authorized pages from their selected text or title block IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        pages: {
          type: 'array',
          minItems: 1,
          description: 'Pages to highlight in one call.',
          items: {
            type: 'object',
            properties: {
              pageUuid: { type: 'string', format: 'uuid' },
              blockIds: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'string',
                  description: 'Page-local block ID returned by document_get, for example G012.',
                },
              },
            },
            required: ['pageUuid', 'blockIds'],
            additionalProperties: false,
          },
        },
      },
      required: ['pages'],
      additionalProperties: false,
    },
  },
];

export class McpServerComponent extends ServerComponent
{
  constructor({ path = '/mcp', documentOptions } = {})
  {
    super();

    this.path = path;
    this.documentOptions = documentOptions;
  }

  async start()
  {
    this.server.application.post(this.path, async (request, response) =>
    {
      try
      {
        const bearer = await this._authenticate(
          request.headers.authorization,
        );

        const payload = request.body;

        if (
          !payload
          || payload.jsonrpc !== '2.0'
          || typeof payload.method !== 'string'
        )
        {
          this._sendError(
            response,
            payload?.id ?? null,
            -32600,
            'Invalid JSON-RPC request.',
          );

          return;
        }

        await this._handleRequest(payload, bearer, response);
      }
      catch (error)
      {
        if (error.status === 401)
        {
          response.status(401).json({
            error: error.message,
          });

          return;
        }

        this._sendError(
          response,
          request.body?.id ?? null,
          -32603,
          error.message,
        );
      }
    });
  }

  async _handleRequest(payload, bearer, response)
  {
    switch (payload.method)
    {
      case 'initialize':
      {
        this._sendResult(response, payload.id, {
          protocolVersion:
            payload.params?.protocolVersion || '2025-11-25',

          capabilities: {
            tools: {
              listChanged: false,
            },
          },

          serverInfo: {
            name: 'rag-server',
            version: '1.0.0',
          },

          instructions:
            'Search visual document pages, then retrieve selected page images with document_get.',
        });

        return;
      }

      case 'notifications/initialized':
      {
        response.status(202).end();
        return;
      }

      case 'tools/list':
      {
        this._sendResult(response, payload.id, {
          tools,
        });

        return;
      }

      case 'tools/call':
      {
        await this._callTool(payload, bearer, response);
        return;
      }

      default:
      {
        this._sendError(
          response,
          payload.id ?? null,
          -32601,
          `Method not found: ${payload.method}`,
        );
      }
    }
  }

  async _callTool(payload, bearer, response)
  {
    const name = payload.params?.name;
    const args = payload.params?.arguments ?? {};

    if (!tools.some(tool => tool.name === name))
    {
      this._sendError(
        response,
        payload.id,
        -32602,
        `Unknown tool: ${name}`,
      );

      return;
    }

    try
    {
      let result;

      if (name === 'document_add')
      {
        Log.debug(`[MCP][document_add] Request ${payload.id} started for ${args.file?.name ?? 'unknown file'}.`);
        result = await Document.add(
          args,
          bearer,
          this.documentOptions,
        );
        Log.debug(`[MCP][document_add] Request ${payload.id} completed for ${args.file.name}.`);
      }
      else if (name === 'document_search')
      {
        const searchArgs = {
          limit: this.documentOptions.searchLimit,
          ...args,
        };

        result = await Document.search(
          searchArgs,
          bearer,
          this.documentOptions,
        );
      }
      else if (name === 'document_list')
      {
        result = await Document.list(args, bearer);
      }
      else if (name === 'page_highlight')
      {
        result = {
          pages: await Promise.all(args.pages.map(async page => await DocumentPage.getAuthorizedHighlight(
            page.pageUuid, page.blockIds, bearer.uuid, this.documentOptions.pageImageDpi,
          ))),
        };
      }
      else
      {
        const documentRequests = args.documents ?? [{ documentUuid: args.documentUuid, pageNumbers: args.pageNumbers }];

        if (!args.documents && !args.documentUuid)
        {
          throw new Error('documents or documentUuid is required.');
        }

        result = await Promise.all(documentRequests.map(async documentRequest => await Document.getAuthorized({
          ...documentRequest,
          includeOriginal: args.includeOriginal,
          includePageImages: args.includePageImages,
          pageImageDpi: args.pageImageDpi ?? this.documentOptions.pageImageDpi,
        }, bearer, this.documentOptions)));
      }

      this._sendResult(
        response,
        payload.id,
        this._buildToolResult(name, result),
      );
    }
    catch (error)
    {
      Log.error(`[MCP][${name}] Request ${payload.id} failed: ${error.message}`);
      this._sendResult(response, payload.id, {
        content: [
          {
            type: 'text',
            text: error.message,
          },
        ],
        isError: true,
      });
    }
  }

  _buildToolResult(name, result)
  {
    if (name === 'page_highlight')
    {
      const pages = result.pages.map(({ image, ...page }) => page);
      const content = [
        {
          type: 'text',
          text: `${result.pages.length} page highlight(s) calculated.`,
        },
        ...result.pages.map((page) => ({
          type: 'image',
          data: page.image.content.toString('base64'),
          mimeType: page.image.mimeType,
        })),
      ];

      return {
        content,
        structuredContent: { pages },
      };
    }

    if (name === 'document_list')
    {
      return {
        content: [
          {
            type: 'text',
            text: `${result.documents.length} document(s) returned.`,
          },
        ],
        structuredContent: result,
      };
    }

    if (name === 'document_search')
    {
      return {
        content: [
          {
            type: 'text',
            text: `${result.documents.length} document search result(s) returned.`,
          },
        ],
        structuredContent: result,
      };
    }

    if (name === 'document_add')
    {
      return {
        content: [
          {
            type: 'text',
            text: 'Document added and indexed.',
          },
        ],

        structuredContent: {
          result,
        },
      };
    }

    const documents = Array.isArray(result) ? result : [result];
    const structuredDocuments = documents.map(({ pages, original, includePageImages, ...metadata }) => ({
      ...metadata,
      pages: pages.map(({ image, ...page }) => page),
    }));
    const structuredContent = { documents: structuredDocuments };
    const pageCount = structuredDocuments.reduce((count, document) => count + document.pages.length, 0);

    const content = [
      {
        type: 'text',
        text: `${pageCount} document page(s) returned.`,
      },
    ];

    for (const document of documents)
    {
      if (document.includePageImages)
      {
        for (const page of document.pages)
        {
          content.push({ type: 'image', data: page.image.content.toString('base64'), mimeType: page.image.mimeType });
        }
      }

      if (document.original)
      {
        content.push({
          type: 'resource',
          resource: {
            uri: `rag://document/${document.documentUuid}/original`,
            mimeType: document.original.mimeType,
            blob: document.original.content.toString('base64'),
          },
        });
      }
    }

    return {
      content,
      structuredContent,
    };
  }

  async _authenticate(authorization)
  {
    if (
      typeof authorization !== 'string'
      || !authorization.startsWith('Bearer ')
      || authorization.length === 7
    )
    {
      const error = new Error('Bearer token is missing.');
      error.status = 401;
      throw error;
    }

    const query = new DbQueryAuthenticatedBearer();

    const bearer = await query.authenticate(
      authorization.slice(7),
    );

    if (!bearer)
    {
      const error = new Error(
        'Bearer token is invalid or inactive.',
      );

      error.status = 401;
      throw error;
    }

    return bearer;
  }

  _sendResult(response, id, result)
  {
    response.status(200).json({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  _sendError(response, id, code, message)
  {
    response.status(200).json({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    });
  }
}