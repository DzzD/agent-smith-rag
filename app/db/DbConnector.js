/**
 * AppCoreJS Framework
 * APP LAYER
 * ONE-SHOT GENERATED FILE
 * INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 *
 * This file can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If deleted, it can be generated again by re-running app-core.
 *
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { CoreDbConnector } from '../../core/db/CoreDbConnector.js';
import { Log } from '../Log.js';

export class DbConnector extends CoreDbConnector
{
	async query(sql, params = [])
	{
		const startedAt = process.hrtime.bigint();

		const parameterText = params.map((value, index) => `$${index + 1}=${JSON.stringify(value ?? null) ?? 'null'}`.slice(0, 64)).join(' ');

		try
		{
			return await super.query(sql, params);
		}
		catch (error)
		{
			const queryError = error.originalError ?? error;

			Log.error('[DbConnector][query][error]', this.databaseName, {
				message: queryError.message,
				code: queryError.code,
				detail: queryError.detail,
				hint: queryError.hint,
				position: queryError.position,
			}, sql, parameterText);

			throw error;
		}
		finally
		{
			const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

			if (durationMs > 100)
			{
				Log.warn('[DbConnector][query][>100ms]', this.databaseName, `${durationMs.toFixed(2)}ms`, sql, parameterText);
			}
		}
	}
}
