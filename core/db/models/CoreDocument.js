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
import { Domain } from '../../../app/db/models/Domain.js';
import { DocumentChunk } from '../../../app/db/models/DocumentChunk.js';
import { DocumentPage } from '../../../app/db/models/DocumentPage.js';

export class CoreDocument extends DbObject
{
    _uuid;
    _domainUuid;
    _name;
    _mimeType;
    _originalContent;
    _binarySha256;
    _pageCount;
    _metadata;
    _createdAt;
    _updatedAt;
    _originalFilename;
    _description;
    _descriptionEmbedding;
    _descriptionEmbeddingModel;
    __uuid;
    __domainUuid;
    __name;
    __mimeType;
    __originalContent;
    __binarySha256;
    __pageCount;
    __metadata;
    __createdAt;
    __updatedAt;
    __originalFilename;
    __description;
    __descriptionEmbedding;
    __descriptionEmbeddingModel;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'document';

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
           domain_uuid:
                {
                    columnName: "domain_uuid",
                    attributeName: "_domainUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.domain.uuid"
                },
           name:
                {
                    columnName: "name",
                    attributeName: "_name",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           mime_type:
                {
                    columnName: "mime_type",
                    attributeName: "_mimeType",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           original_content:
                {
                    columnName: "original_content",
                    attributeName: "_originalContent",
                    isPrimaryKey: false,
                    dataType: "bytea",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           binary_sha256:
                {
                    columnName: "binary_sha256",
                    attributeName: "_binarySha256",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           page_count:
                {
                    columnName: "page_count",
                    attributeName: "_pageCount",
                    isPrimaryKey: false,
                    dataType: "integer",
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
                },
           original_filename:
                {
                    columnName: "original_filename",
                    attributeName: "_originalFilename",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           description:
                {
                    columnName: "description",
                    attributeName: "_description",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           description_embedding:
                {
                    columnName: "description_embedding",
                    attributeName: "_descriptionEmbedding",
                    isPrimaryKey: false,
                    dataType: "USER-DEFINED",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           description_embedding_model:
                {
                    columnName: "description_embedding_model",
                    attributeName: "_descriptionEmbeddingModel",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._domainUuid = null;
        this.__domainUuid = null;

        this._name = null;
        this.__name = null;

        this._mimeType = null;
        this.__mimeType = null;

        this._originalContent = null;
        this.__originalContent = null;

        this._binarySha256 = null;
        this.__binarySha256 = null;

        this._pageCount = null;
        this.__pageCount = null;

        this._metadata = null;
        this.__metadata = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

        this._originalFilename = null;
        this.__originalFilename = null;

        this._description = null;
        this.__description = null;

        this._descriptionEmbedding = null;
        this.__descriptionEmbedding = null;

        this._descriptionEmbeddingModel = null;
        this.__descriptionEmbeddingModel = null;

    }

    get uuid()
    {
        return this._uuid;
    }

    set uuid(uuid)
    {
        this._uuid = uuid;
    }

    get domainUuid()
    {
        return this._domainUuid;
    }

    set domainUuid(domainUuid)
    {
        this._domainUuid = domainUuid;
    }

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
    }

    get mimeType()
    {
        return this._mimeType;
    }

    set mimeType(mimeType)
    {
        this._mimeType = mimeType;
    }

    get originalContent()
    {
        return this._originalContent;
    }

    set originalContent(originalContent)
    {
        this._originalContent = originalContent;
    }

    get binarySha256()
    {
        return this._binarySha256;
    }

    set binarySha256(binarySha256)
    {
        this._binarySha256 = binarySha256;
    }

    get pageCount()
    {
        return this._pageCount;
    }

    set pageCount(pageCount)
    {
        this._pageCount = pageCount;
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

    get originalFilename()
    {
        return this._originalFilename;
    }

    set originalFilename(originalFilename)
    {
        this._originalFilename = originalFilename;
    }

    get description()
    {
        return this._description;
    }

    set description(description)
    {
        this._description = description;
    }

    get descriptionEmbedding()
    {
        return this._descriptionEmbedding;
    }

    set descriptionEmbedding(descriptionEmbedding)
    {
        this._descriptionEmbedding = descriptionEmbedding;
    }

    get descriptionEmbeddingModel()
    {
        return this._descriptionEmbeddingModel;
    }

    set descriptionEmbeddingModel(descriptionEmbeddingModel)
    {
        this._descriptionEmbeddingModel = descriptionEmbeddingModel;
    }

    async getDomain()
    {
        const domain = new Domain(this._connectionUid);
        const found = await domain.search('"uuid" = $1', [this.domainUuid]);
        if(!found)
        {
            return null;
        }
        await domain.next();
        return domain;
    }

    async getDocumentChunks()
    {
        const documentChunks = new DocumentChunk(this._connectionUid);
        const found = await documentChunks.search('"document_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentChunks;
    }

    async getDocumentPages()
    {
        const documentPages = new DocumentPage(this._connectionUid);
        const found = await documentPages.search('"document_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documentPages;
    }

}