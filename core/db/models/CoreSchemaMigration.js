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

export class CoreSchemaMigration extends DbObject
{
    _name;
    _appliedAt;
    __name;
    __appliedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'rag_server';
        this._schema = 'public';
        this._tableName = 'schema_migration';

        this._fields =
        {
           name:
                {
                    columnName: "name",
                    attributeName: "_name",
                    isPrimaryKey: true,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           applied_at:
                {
                    columnName: "applied_at",
                    attributeName: "_appliedAt",
                    isPrimaryKey: false,
                    dataType: "timestamp with time zone",
                    isNullable: false,
                    defaultValue: "now()",
                    foreignKey: null
                }
        };


        this._primaryKeys = ['name'];


        this._name = null;
        this.__name = null;

        this._appliedAt = null;
        this.__appliedAt = null;

    }

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
    }

    get appliedAt()
    {
        return this._appliedAt;
    }

    set appliedAt(appliedAt)
    {
        this._appliedAt = appliedAt;
    }

}