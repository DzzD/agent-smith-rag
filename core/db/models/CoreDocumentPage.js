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

export class CoreDocumentPage extends DbObject
{
    _uuid;
    _documentUuid;
    _pageNumber;
    _imageContent;
    _imageMimeType;
    _ocrRaw;
    _ocrEnriched;
    _metadata;
    _createdAt;
    _updatedAt;
    _blocks;
    _description;
    _descriptionEmbedding;
    _descriptionEmbeddingModel;
    _pixelWidth;
    _pixelHeight;
    _dpi;
    __uuid;
    __documentUuid;
    __pageNumber;
    __imageContent;
    __imageMimeType;
    __ocrRaw;
    __ocrEnriched;
    __metadata;
    __createdAt;
    __updatedAt;
    __blocks;
    __description;
    __descriptionEmbedding;
    __descriptionEmbeddingModel;
    __pixelWidth;
    __pixelHeight;
    __dpi;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'document_page';

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
           page_number:
                {
                    columnName: "page_number",
                    attributeName: "_pageNumber",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           image_content:
                {
                    columnName: "image_content",
                    attributeName: "_imageContent",
                    isPrimaryKey: false,
                    dataType: "bytea",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           image_mime_type:
                {
                    columnName: "image_mime_type",
                    attributeName: "_imageMimeType",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           ocr_raw:
                {
                    columnName: "ocr_raw",
                    attributeName: "_ocrRaw",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           ocr_enriched:
                {
                    columnName: "ocr_enriched",
                    attributeName: "_ocrEnriched",
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
                },
           blocks:
                {
                    columnName: "blocks",
                    attributeName: "_blocks",
                    isPrimaryKey: false,
                    dataType: "jsonb",
                    isNullable: true,
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
                },
           pixel_width:
                {
                    columnName: "pixel_width",
                    attributeName: "_pixelWidth",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           pixel_height:
                {
                    columnName: "pixel_height",
                    attributeName: "_pixelHeight",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           dpi:
                {
                    columnName: "dpi",
                    attributeName: "_dpi",
                    isPrimaryKey: false,
                    dataType: "integer",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._documentUuid = null;
        this.__documentUuid = null;

        this._pageNumber = null;
        this.__pageNumber = null;

        this._imageContent = null;
        this.__imageContent = null;

        this._imageMimeType = null;
        this.__imageMimeType = null;

        this._ocrRaw = null;
        this.__ocrRaw = null;

        this._ocrEnriched = null;
        this.__ocrEnriched = null;

        this._metadata = null;
        this.__metadata = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

        this._blocks = null;
        this.__blocks = null;

        this._description = null;
        this.__description = null;

        this._descriptionEmbedding = null;
        this.__descriptionEmbedding = null;

        this._descriptionEmbeddingModel = null;
        this.__descriptionEmbeddingModel = null;

        this._pixelWidth = null;
        this.__pixelWidth = null;

        this._pixelHeight = null;
        this.__pixelHeight = null;

        this._dpi = null;
        this.__dpi = null;

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

    get pageNumber()
    {
        return this._pageNumber;
    }

    set pageNumber(pageNumber)
    {
        this._pageNumber = pageNumber;
    }

    get imageContent()
    {
        return this._imageContent;
    }

    set imageContent(imageContent)
    {
        this._imageContent = imageContent;
    }

    get imageMimeType()
    {
        return this._imageMimeType;
    }

    set imageMimeType(imageMimeType)
    {
        this._imageMimeType = imageMimeType;
    }

    get ocrRaw()
    {
        return this._ocrRaw;
    }

    set ocrRaw(ocrRaw)
    {
        this._ocrRaw = ocrRaw;
    }

    get ocrEnriched()
    {
        return this._ocrEnriched;
    }

    set ocrEnriched(ocrEnriched)
    {
        this._ocrEnriched = ocrEnriched;
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

    get blocks()
    {
        return this._blocks;
    }

    set blocks(blocks)
    {
        this._blocks = blocks;
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

    get pixelWidth()
    {
        return this._pixelWidth;
    }

    set pixelWidth(pixelWidth)
    {
        this._pixelWidth = pixelWidth;
    }

    get pixelHeight()
    {
        return this._pixelHeight;
    }

    set pixelHeight(pixelHeight)
    {
        this._pixelHeight = pixelHeight;
    }

    get dpi()
    {
        return this._dpi;
    }

    set dpi(dpi)
    {
        this._dpi = dpi;
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

    async getPageChunks()
    {
        const pageChunks = new PageChunk(this._connectionUid);
        const found = await pageChunks.search('"page_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return pageChunks;
    }

}