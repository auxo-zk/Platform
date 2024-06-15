import 'dotenv/config.js';
import { Mina, Provable, PublicKey, fetchAccount, Field } from 'o1js';
import { fetchAccounts } from './index.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ProjectAction } from '../../contracts/Project.js';

async function main() {
    // Network configuration
    const network = Mina.Network({
        mina: process.env.LIGHTNET_MINA as string,
        archive: process.env.LIGHTNET_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);

    const rawActions = await Utils.fetchActions(
        PublicKey.fromBase58(
            'B62qrXSf1v8nhbkqTGvZmThwehN3QDZaT5VzJWsX3d52SNgiQwtCv5y'
        )
    );

    const actions: ProjectAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return ProjectAction.fromFields(action);
    });
    actions.map((e) => Provable.log(e));
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
