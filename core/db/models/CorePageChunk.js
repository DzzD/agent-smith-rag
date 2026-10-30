/**
 * AppCoreJS Framework
 * GENERATED PROJECT CORE MODEL
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated from the project database schema by app-core.
 * This file may be regenerated at any time.
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { DbObject } from '../../../app/db/DbObject.js';
import { DocumentPage } from '../../../app/db/models/DocumentPage.js';
import { DocumentChunk } from '../../../app/db/models/DocumentChunk.js';

export class CorePageChunk extends DbObject
{
    _uuid;
    _pageUuid;
    _chunkIndex;
    _content;
    _characterCount;
    _tokenCount;
    _embedding;
    _embeddingModel;
    _metadata;
    _createdAt;
    _updatedAt;
    __uuid;
    __pageUuid;
    __chunkIndex;
    __content;
    __characterCount;
    __tokenCount;
    __embedding;
    __embeddingModel;
    __metadata;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'page_chunk';

        this._fields =
        {
           uuid:
                {
                    columnName: "uuid",
                    attributeName: "_uuid",
                    isPrimaryKey: true,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: "gen_random_uuid()",
                    foreignKey: null
                },
           page_uuid:
                {
                    columnName: "page_uuid",
                    attributeName: "_pageUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.document_page.uuid"
                },
           chunk_index:
                {
                    columnName: "chunk_index",
                    attributeName: "_chunkIndex",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           content:
                {
                    columnName: "content",
                    attributeName: "_content",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           character_count:
                {
                    columnName: "character_count",
                    attributeName: "_characterCount",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           token_count:
                {
                    columnName: "token_count",
                    attributeName: "_tokenCount",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           embedding:
                {
                    columnName: "embedding",
                    attributeName: "_embedding",
                    isPrimaryKey: false,
                    dataType: "USER-DEFINED",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           embedding_model:
                {
                    columnName: "embedding_model",
                    attributeName: "_embeddingModel",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           metadata:
                {
                    columnName: "metadata",
                    attributeName: "_metadata",
                    isPrimaryKey: false,
                    dataType: "jsonb",
                    isNullable: false,
                    defaultValue: "'{}'::jsonb",
                    foreignKey: null
                },
           created_at:
                {
                    columnName: "created_at",
                    attributeName: "_createdAt",
                    isPrimaryKey: false,
                    dataType: "timestamp with time zone",
                    isNullable: false,
                    defaultValue: "now()",
                    foreignKey: null
                },
           updated_at:
                {
                    columnName: "updated_at",
                    attributeName: "_updatedAt",
                    isPrimaryKey: false,
                    dataType: "timestamp with time zone",
                    isNullable: false,
                    defaultValue: "now()",
                    foreignKey: null
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._pageUuid = null;
        this.__pageUuid = null;

        this._chunkIndex = null;
        this.__chunkIndex = null;

        this._content = null;
        this.__content = null;

        this._characterCount = null;
        this.__characterCount = null;

        this._tokenCount = null;
        this.__tokenCount = null;

        this._embedding = null;
        this.__embedding = null;

        this._embeddingModel = null;
        this.__embeddingModel = null;

        this._metadata = null;
        this.__metadata = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

    }

    get uuid()
    {
        return this._uuid;
    }

    set uuid(uuid)
    {
        this._uuid = uuid;
    }

    get pageUuid()
    {
        return this._pageUuid;
    }

    set pageUuid(pageUuid)
    {
        this._pageUuid = pageUuid;
    }

    get chunkIndex()
    {
        return this._chunkIndex;
    }

    set chunkIndex(chunkIndex)
    {
        this._chunkIndex = chunkIndex;
    }

    get content()
    {
        return this._content;
    }

    set content(content)
    {
        this._content = content;
    }

    get characterCount()
    {
        return this._characterCount;
    }

    set characterCount(characterCount)
    {
        this._characterCount = characterCount;
    }

    get tokenCount()
    {
        return this._tokenCount;
    }

    set tokenCount(tokenCount)
    {
        this._tokenCount = tokenCount;
    }

    get embedding()
    {
        return this._embedding;
    }

    set embedding(embedding)
    {
        this._embedding = embedding;
    }

    get embeddingModel()
    {
        return this._embeddingModel;
    }

    set embeddingModel(embeddingModel)
    {
        this._embeddingModel = embeddingModel;
    }

    get metadata()
    {
        return this._metadata;
    }

    set metadata(metadata)
    {
        this._metadata = metadata;
    }

    get createdAt()
    {
        return this._createdAt;
    }

    set createdAt(createdAt)
    {
        this._createdAt = createdAt;
    }

    get updatedAt()
    {
        return this._updatedAt;
    }

    set updatedAt(updatedAt)
    {
        this._updatedAt = updatedAt;
    }

    async getDocumentPage()
    {
        const documentPage = new DocumentPage(this._connectionUid);
        const found = await documentPage.search('"uuid" = $1', [this.pageUuid]);
        if(!found)
        {
            return null;
        }
        await documentPage.next();
        return documentPage;
    }

    async getDocumentChunks()
    {
        const documentChunks = new DocumentChunk(this._connectionUid);
        const found = await documentChunks.search('"page_chunk_uuid_1" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentChunks;
    }

    async getDocumentChunks2()
    {
        const documentChunks = new DocumentChunk(this._connectionUid);
        const found = await documentChunks.search('"page_chunk_uuid_2" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentChunks;
    }

    async getDocumentChunks3()
    {
        const documentChunks = new DocumentChunk(this._connectionUid);
        const found = await documentChunks.search('"page_chunk_uuid_3" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentChunks;
    }

    async getDocumentChunks4()
    {
        const documentChunks = new DocumentChunk(this._connectionUid);
        const found = await documentChunks.search('"page_chunk_uuid_4" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentChunks;
    }

}