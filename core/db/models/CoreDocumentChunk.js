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
import { Document } from '../../../app/db/models/Document.js';
import { PageChunk } from '../../../app/db/models/PageChunk.js';

export class CoreDocumentChunk extends DbObject
{
    _uuid;
    _documentUuid;
    _chunkIndex;
    _pageChunkUuid1;
    _pageChunkUuid2;
    _pageChunkUuid3;
    _pageChunkUuid4;
    _content;
    _characterCount;
    _tokenCount;
    _embedding;
    _embeddingModel;
    _metadata;
    _createdAt;
    _updatedAt;
    __uuid;
    __documentUuid;
    __chunkIndex;
    __pageChunkUuid1;
    __pageChunkUuid2;
    __pageChunkUuid3;
    __pageChunkUuid4;
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
        this._tableName = 'document_chunk';

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
           document_uuid:
                {
                    columnName: "document_uuid",
                    attributeName: "_documentUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.document.uuid"
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
           page_chunk_uuid_1:
                {
                    columnName: "page_chunk_uuid_1",
                    attributeName: "_pageChunkUuid1",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.page_chunk.uuid"
                },
           page_chunk_uuid_2:
                {
                    columnName: "page_chunk_uuid_2",
                    attributeName: "_pageChunkUuid2",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.page_chunk.uuid"
                },
           page_chunk_uuid_3:
                {
                    columnName: "page_chunk_uuid_3",
                    attributeName: "_pageChunkUuid3",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.page_chunk.uuid"
                },
           page_chunk_uuid_4:
                {
                    columnName: "page_chunk_uuid_4",
                    attributeName: "_pageChunkUuid4",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.page_chunk.uuid"
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

        this._documentUuid = null;
        this.__documentUuid = null;

        this._chunkIndex = null;
        this.__chunkIndex = null;

        this._pageChunkUuid1 = null;
        this.__pageChunkUuid1 = null;

        this._pageChunkUuid2 = null;
        this.__pageChunkUuid2 = null;

        this._pageChunkUuid3 = null;
        this.__pageChunkUuid3 = null;

        this._pageChunkUuid4 = null;
        this.__pageChunkUuid4 = null;

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

    get documentUuid()
    {
        return this._documentUuid;
    }

    set documentUuid(documentUuid)
    {
        this._documentUuid = documentUuid;
    }

    get chunkIndex()
    {
        return this._chunkIndex;
    }

    set chunkIndex(chunkIndex)
    {
        this._chunkIndex = chunkIndex;
    }

    get pageChunkUuid1()
    {
        return this._pageChunkUuid1;
    }

    set pageChunkUuid1(pageChunkUuid1)
    {
        this._pageChunkUuid1 = pageChunkUuid1;
    }

    get pageChunkUuid2()
    {
        return this._pageChunkUuid2;
    }

    set pageChunkUuid2(pageChunkUuid2)
    {
        this._pageChunkUuid2 = pageChunkUuid2;
    }

    get pageChunkUuid3()
    {
        return this._pageChunkUuid3;
    }

    set pageChunkUuid3(pageChunkUuid3)
    {
        this._pageChunkUuid3 = pageChunkUuid3;
    }

    get pageChunkUuid4()
    {
        return this._pageChunkUuid4;
    }

    set pageChunkUuid4(pageChunkUuid4)
    {
        this._pageChunkUuid4 = pageChunkUuid4;
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

    async getDocument()
    {
        const document = new Document(this._connectionUid);
        const found = await document.search('"uuid" = $1', [this.documentUuid]);
        if(!found)
        {
            return null;
        }
        await document.next();
        return document;
    }

    async getPageChunk()
    {
        const pageChunk = new PageChunk(this._connectionUid);
        const found = await pageChunk.search('"uuid" = $1', [this.pageChunkUuid1]);
        if(!found)
        {
            return null;
        }
        await pageChunk.next();
        return pageChunk;
    }

    async getPageChunk2()
    {
        const pageChunk = new PageChunk(this._connectionUid);
        const found = await pageChunk.search('"uuid" = $1', [this.pageChunkUuid2]);
        if(!found)
        {
            return null;
        }
        await pageChunk.next();
        return pageChunk;
    }

    async getPageChunk3()
    {
        const pageChunk = new PageChunk(this._connectionUid);
        const found = await pageChunk.search('"uuid" = $1', [this.pageChunkUuid3]);
        if(!found)
        {
            return null;
        }
        await pageChunk.next();
        return pageChunk;
    }

    async getPageChunk4()
    {
        const pageChunk = new PageChunk(this._connectionUid);
        const found = await pageChunk.search('"uuid" = $1', [this.pageChunkUuid4]);
        if(!found)
        {
            return null;
        }
        await pageChunk.next();
        return pageChunk;
    }

}