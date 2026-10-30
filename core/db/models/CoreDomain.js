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
import { BearerDomain } from '../../../app/db/models/BearerDomain.js';
import { Document } from '../../../app/db/models/Document.js';

export class CoreDomain extends DbObject
{
    _uuid;
    _uid;
    _name;
    _createdAt;
    _updatedAt;
    _parentDomainUuid;
    __uuid;
    __uid;
    __name;
    __createdAt;
    __updatedAt;
    __parentDomainUuid;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'domain';

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
           uid:
                {
                    columnName: "uid",
                    attributeName: "_uid",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
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
           parent_domain_uuid:
                {
                    columnName: "parent_domain_uuid",
                    attributeName: "_parentDomainUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.domain.uuid"
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._uid = null;
        this.__uid = null;

        this._name = null;
        this.__name = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

        this._parentDomainUuid = null;
        this.__parentDomainUuid = null;

    }

    get uuid()
    {
        return this._uuid;
    }

    set uuid(uuid)
    {
        this._uuid = uuid;
    }

    get uid()
    {
        return this._uid;
    }

    set uid(uid)
    {
        this._uid = uid;
    }

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
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

    get parentDomainUuid()
    {
        return this._parentDomainUuid;
    }

    set parentDomainUuid(parentDomainUuid)
    {
        this._parentDomainUuid = parentDomainUuid;
    }

    async getDomain()
    {
        const domain = new Domain(this._connectionUid);
        const found = await domain.search('"uuid" = $1', [this.parentDomainUuid]);
        if(!found)
        {
            return null;
        }
        await domain.next();
        return domain;
    }

    async getBearerDomains()
    {
        const bearerDomains = new BearerDomain(this._connectionUid);
        const found = await bearerDomains.search('"domain_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return bearerDomains;
    }

    async getDocuments()
    {
        const documents = new Document(this._connectionUid);
        const found = await documents.search('"domain_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return documents;
    }

    async getDomains()
    {
        const domains = new Domain(this._connectionUid);
        const found = await domains.search('"parent_domain_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return domains;
    }

}