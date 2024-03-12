import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Provable,
    UInt32,
} from 'o1js';
import {
    ParticipationContract,
    RollupParticipation,
} from '../contracts/Participation-clone';
import { CampaignContract, RollupCampaign } from '../contracts/Campaign-clone';
import { FundingContract } from '../contracts/Funding-clone';

let proofsEnabled = true;

describe('Test compile contract', () => {
    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        zkAppAddress: PublicKey,
        zkAppPrivateKey: PrivateKey,
        zkApp: ParticipationContract;

    beforeAll(async () => {
        if (proofsEnabled) {
            Provable.log(FundingContract.analyzeMethods());
            // Provable.log(ParticipationContract.analyzeMethods());
            // Provable.log(ParticipationContract.analyzeMethods());
        }
    });

    // beforeEach(() => {
    //     const Local = Mina.LocalBlockchain({ proofsEnabled });
    //     Mina.setActiveInstance(Local);
    //     ({ privateKey: deployerKey, publicKey: deployerAccount } =
    //         Local.testAccounts[0]);
    //     ({ privateKey: senderKey, publicKey: senderAccount } =
    //         Local.testAccounts[1]);
    //     zkAppPrivateKey = PrivateKey.random();
    //     zkAppAddress = zkAppPrivateKey.toPublicKey();
    //     zkApp = new ParticipationContract(zkAppAddress);
    // });

    // async function localDeploy() {
    //     const txn = await Mina.transaction(deployerAccount, () => {
    //         AccountUpdate.fundNewAccount(deployerAccount);
    //         zkApp.deploy();
    //     });
    //     await txn.prove();
    //     // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    //     await txn.sign([deployerKey, zkAppPrivateKey]).send();
    // }

    it('1', async () => {
        // await localDeploy();
        console.log('hihi');
    });
});
