import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Provable,
    UInt32,
    Cache,
} from 'o1js';
import {
    ParticipationContract,
    RollupParticipation,
} from '../contracts/Participation';
import { CampaignContract, RollupCampaign } from '../contracts/Campaign';
import { Utils } from '@auxo-dev/auxo-libs';
// import { FundingContract, RollupFunding } from '../contracts/Funding';

let proofsEnabled = true;

describe('Test compile contract', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        zkAppAddress: PublicKey,
        zkAppPrivateKey: PrivateKey,
        zkApp: ParticipationContract;

    beforeAll(async () => {
        const packed = Utils.packNumberArray([2, 2, 2], 8);
        Provable.log(packed);
        const unpacked = unpackNumberArray(packed, 8);
        console.log(unpacked);
        for (let i = 0; i < 3; i++) {
            const index = Field.fromBits(
                packed.toBits().slice(i * 8, (i + 1) * 8)
            );
        }
        if (proofsEnabled) {
            // Provable.log((await FundingContract.compile()).verificationKey);
            // Provable.log(ParticipationContract.analyzeMethods());
            // Provable.log(ParticipationContract.analyzeMethods());
        }
    });

    function unpackNumberArray(packed: Field, maxSize: number): number[] {
        let numbers: number[] = [];
        for (let i = 0; i < 255 / maxSize; i++) {
            numbers.push(
                Number(
                    Field.fromBits(
                        packed.toBits().slice(i * maxSize, (i + 1) * maxSize)
                    )
                )
            );
        }
        return numbers;
    }

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
