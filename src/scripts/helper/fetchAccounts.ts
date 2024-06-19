import 'dotenv/config.js';
import { Mina, Provable, PublicKey, fetchAccount } from 'o1js';
import { fetchAccounts } from './index.js';
import { ProjectContract } from '../../contracts/Project.js';
import { CampaignContract } from '../../contracts/Campaign.js';

async function main() {
    // Network configuration
    const network = Mina.Network({
        mina: process.env.LIGHTNET_MINA as string,
        archive: process.env.LIGHTNET_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);

    const ACCOUNTS = [
        PublicKey.fromBase58(
            'B62qpaYMPKGMpC4UvuscjW5VoX21eQJFWmcGxGW1zVqfMAUC18yx933'
        ),
    ];

    Provable.log(await fetchAccounts(ACCOUNTS));

    const someContract = new CampaignContract(ACCOUNTS[0]);

    Provable.log(someContract.zkAppRoot.get());
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
