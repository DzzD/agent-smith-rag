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
import { BearerDomain } from '../../../app/db/models/BearerDomain.js';

export class CoreBearer extends DbObject
{
    _uuid;
    _name;
    _tokenHash;
    _active;
    _createdAt;
    _updatedAt;
    __uuid;
    __name;
    __tokenHash;
    __active;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'bearer';

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
           token_hash:
                {
                    columnName: "token_hash",
                    attributeName: "_tokenHash",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           active:
                {
                    columnName: "active",
                    attributeName: "_active",
                    isPrimaryKey: false,
                    dataType: "boolean",
                    isNullable: false,
                    defaultValue: "true",
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

        this._name = null;
        this.__name = null;

        this._tokenHash = null;
        this.__tokenHash = null;

        this._active = null;
        this.__active = null;

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

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
    }

    get tokenHash()
    {
        return this._tokenHash;
    }

    set tokenHash(tokenHash)
    {
        this._tokenHash = tokenHash;
    }

    get active()
    {
        return this._active;
    }

    set active(active)
    {
        this._active = active;
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

    async getBearerDomains()
    {
        const bearerDomains = new BearerDomain(this._connectionUid);
        const found = await bearerDomains.search('"bearer_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return bearerDomains;
    }

}