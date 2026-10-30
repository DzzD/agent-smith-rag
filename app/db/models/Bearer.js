/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreBearer } from '../../../core/db/models/CoreBearer.js';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { BearerDomain } from './BearerDomain.js';
import { Domain } from './Domain.js';
import { DbManager } from '../DbManager.js';

export class Bearer extends CoreBearer
{
	constructor(connectionUid = null)
	{
		super(connectionUid);
		this.domainUuids = [];
		this.domainUids = [];
		this.accessToken = null;
	}

	static async add({ name, domainUids, token = null })
	{
		const resolvedToken = token ?? randomBytes(32).toString('base64url');
		const connectionUid = `bearer-add-${randomBytes(16).toString('hex')}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;
		let domain;

		try
		{
			await connector.beginTransaction();
			transactionOpened = true;
			domain = new Domain(connectionUid);
			await domain.search('"uid" = ANY($1::text[])', [domainUids], { order: '"uid" ASC' });
			const domains = [];

			while (await domain.next())
			{
				domains.push({ uuid: domain.uuid, uid: domain.uid });
			}

			if (domains.length !== domainUids.length)
			{
				throw new Error('One or more domains were not found.');
			}

			const bearer = new Bearer(connectionUid);
			bearer.name = name;
			bearer.tokenHash = createHash('sha256').update(resolvedToken).digest('hex');
			bearer.active = true;
			await bearer.save(true);

			for (const domain of domains)
			{
				const authorization = new BearerDomain(connectionUid);
				authorization.bearerUuid = bearer.uuid;
				authorization.domainUuid = domain.uuid;
				await authorization.save(true);
			}

			await connector.commit();
			bearer.domainUuids = domains.map((domain) => domain.uuid);
			bearer.domainUids = domains.map((domain) => domain.uid);
			bearer.accessToken = resolvedToken;
			return bearer;
		}
		catch (error)
		{
			if (transactionOpened)
			{
				await connector.rollback();
			}

			throw error;
		}
		finally
		{
			domain?.close();
			connector.close();
		}
	}
}
