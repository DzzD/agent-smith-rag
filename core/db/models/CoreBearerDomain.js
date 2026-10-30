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
import { Bearer } from '../../../app/db/models/Bearer.js';
import { Domain } from '../../../app/db/models/Domain.js';

export class CoreBearerDomain extends DbObject
{
    _bearerUuid;
    _domainUuid;
    _createdAt;
    _updatedAt;
    __bearerUuid;
    __domainUuid;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'bearer_domain';

        this._fields =
        {
           bearer_uuid:
                {
                    columnName: "bearer_uuid",
                    attributeName: "_bearerUuid",
                    isPrimaryKey: true,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.bearer.uuid"
                },
           domain_uuid:
                {
                    columnName: "domain_uuid",
                    attributeName: "_domainUuid",
                    isPrimaryKey: true,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.domain.uuid"
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


        this._primaryKeys = ['bearer_uuid', 'domain_uuid'];


        this._bearerUuid = null;
        this.__bearerUuid = null;

        this._domainUuid = null;
        this.__domainUuid = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

    }

    get bearerUuid()
    {
        return this._bearerUuid;
    }

    set bearerUuid(bearerUuid)
    {
        this._bearerUuid = bearerUuid;
    }

    get domainUuid()
    {
        return this._domainUuid;
    }

    set domainUuid(domainUuid)
    {
        this._domainUuid = domainUuid;
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

    async getBearer()
    {
        const bearer = new Bearer(this._connectionUid);
        const found = await bearer.search('"uuid" = $1', [this.bearerUuid]);
        if(!found)
        {
            return null;
        }
        await bearer.next();
        return bearer;
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

}