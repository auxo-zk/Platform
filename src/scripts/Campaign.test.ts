import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Reducer,
    Provable,
    UInt32,
    Scalar,
    Bool,
    UInt64,
    Group,
    Cache,
} from 'o1js';
import { ProjectContract, RollupProject } from '../contracts/Project';
import { CampaignContract, RollupCampaign } from '../contracts/Campaign';
import { DefaultRootForCampaignTree } from '../storages/CampaignStorage';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    MemberArray,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions } from 'o1js/dist/node/lib/mina';

let proofsEnabled = true;

describe('Campaign', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContractPrivateKey: PrivateKey,
        campaignContract: CampaignContract;

    beforeAll(async () => {
        await RollupCampaign.compile({ cache });
        if (proofsEnabled) {
            await CampaignContract.compile({ cache });
        }
        const Local = Mina.LocalBlockchain({ proofsEnabled });
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        campaignContractPrivateKey = PrivateKey.random();
        campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
        campaignContract = new CampaignContract(campaignContractPublicKey);

        localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            campaignContract.deploy();
        });
        await tx.prove();
        await tx.sign([deployerKey, campaignContractPrivateKey]).send();
    }

    it('Default root should be correct', async () => {
        expect(campaignContract.nextCampaignId.get()).toEqual(Field(0));
        expect(campaignContract.timelineRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.ipfsHashRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.keyRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.actionState.get()).toEqual(
            Reducer.initialActionState
        );
    });

    // it('1', async () => {
    //     await localDeploy();
    //     const members = new MemberArray();
    //     for (let i = 0; i < ProjectMockData[0].members.length; i++) {
    //         members.push(PublicKey.fromBase58(ProjectMockData[0].members[i]));
    //     }
    //     const tx = await Mina.transaction(senderAccount, () => {
    //         campaignContract.createCampaign(
    //             members,
    //             IpfsHash.fromString(ProjectMockData[0].ipfsHash),
    //             PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
    //         );
    //     });
    //     await tx.prove();
    //     await tx.sign([senderKey]).send();
    //     const actions = await fetchActions(campaignContractPublicKey);
    //     console.log(actions);
    // });
});
