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
    Lightnet,
    fetchAccount,
} from 'o1js';
import { ProjectContract, RollupProject } from '../contracts/Project';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    MemberArray,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions, LocalBlockchain } from 'o1js/dist/node/lib/mina';

let proofsEnabled = true;

describe('Project', () => {
    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContractPrivateKey: PrivateKey,
        projectContract: ProjectContract;

    beforeAll(async () => {
        await RollupProject.compile();
        if (proofsEnabled) {
            await ProjectContract.compile();
        }
    });

    beforeEach(async () => {
        // const Local = Mina.LocalBlockchain({ proofsEnabled });
        const network = Mina.Network({
            mina: 'http://localhost:8080/graphql',
            archive: 'http://localhost:8282',
            lightnetAccountManager: 'http://localhost:8181',
        });

        Mina.setActiveInstance(network);
        deployerKey = (await Lightnet.acquireKeyPair()).privateKey;
        deployerAccount = deployerKey.toPublicKey();
        senderKey = (await Lightnet.acquireKeyPair()).privateKey;
        senderAccount = senderKey.toPublicKey();

        projectContractPrivateKey = PrivateKey.random();
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);
    });

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployerAccount, fee: 1e8 },
            () => {
                AccountUpdate.fundNewAccount(deployerAccount);
                projectContract.deploy();
            }
        );
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
        const tx = await Mina.transaction(
            { sender: senderAccount, fee: 1e8 },
            () => {
                projectContract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                    PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
                );
            }
        );
        await tx.prove();
        await tx.sign([senderKey]).send();
        const actions = await fetchActions(projectContractPublicKey);
        console.log(actions);
    });
});
