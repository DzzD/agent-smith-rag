import { Bearer } from '../../../app/db/models/Bearer.js';
import { parseOptions, requiredOption } from './BearerCommandUtils.js';

export class BearerAddCommand
{
    async run(argv = [])
    {
        const options = parseOptions(argv);
        const name = requiredOption(options, 'name');
        const domainUids = requiredOption(options, 'domains').split(',').map((uid) => uid.trim()).filter(Boolean);
        const token = options.token == null ? null : String(options.token);

        if (domainUids.length === 0)
        {
            throw new Error('missing_required_option:domains');
        }

        const bearer = await Bearer.add({ name, domainUids: [...new Set(domainUids)], token });
        console.log(`Bearer added: ${bearer.name} (${bearer.uuid})`);
        console.log(`Domains: ${bearer.domainUids.join(', ')}`);
        console.log(`Token: ${bearer.accessToken}`);
        console.log('Store this token now; only its SHA-256 hash is persisted.');
        return bearer;
    }
}
