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
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    MemberArray,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions } from 'o1js/dist/node/lib/mina';

let proofsEnabled = true;

describe('Project', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContractPrivateKey: PrivateKey,
        projectContract: ProjectContract;

    beforeAll(async () => {
        await RollupProject.compile({ cache });
        if (proofsEnabled) {
            await ProjectContract.compile({ cache });
        }
    });

    beforeEach(() => {
        const Local = Mina.LocalBlockchain({ proofsEnabled });
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        projectContractPrivateKey = PrivateKey.random();
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            projectContract.deploy();
        });
        await tx.prove();
        await tx.sign([deployerKey, projectContractPrivateKey]).send();
    }

    // it('Default root should be correct', async () => {
    //     await localDeploy();
    //     expect(projectContract.nextProjectId.get()).toEqual(Field(0));
    //     expect(projectContract.memberRoot.get()).toEqual(
    //         DefaultRootForProjectTree
    //     );
    //     expect(projectContract.ipfsHashRoot.get()).toEqual(
    //         DefaultRootForProjectTree
    //     );
    //     expect(projectContract.treasuryAddressRoot.get()).toEqual(
    //         DefaultRootForProjectTree
    //     );
    //     expect(projectContract.actionState.get()).toEqual(
    //         Reducer.initialActionState
    //     );
    // });

    it('1', async () => {
        await localDeploy();
        const members = new MemberArray();
        for (let i = 0; i < ProjectMockData[0].members.length; i++) {
            members.push(PublicKey.fromBase58(ProjectMockData[0].members[i]));
        }
        const tx = await Mina.transaction(senderAccount, () => {
            projectContract.createProject(
                members,
                IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
            );
        });
        await tx.prove();
        await tx.sign([senderKey]).send();
        const actions = await fetchActions(projectContractPublicKey);
        console.log(actions);
    });
});
