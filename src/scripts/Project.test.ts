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
} from 'o1js';
import { ProjectContract, RollupProject } from '../contracts/Project';
import * as projectMockData from './mock/projects.json';
import { DefaultRootForProjectTree } from '../storages/ProjectStorage';

let proofsEnabled = false;

describe('Project', () => {
    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        projectContractAddress: PublicKey,
        projectContractPrivateKey: PrivateKey,
        projectContract: ProjectContract;
    beforeAll(async () => {
        await RollupProject.compile();
        if (proofsEnabled) {
            await ProjectContract.compile();
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
        projectContractAddress = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractAddress);
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            projectContract.deploy();
        });
        await tx.prove();
        await tx.sign([deployerKey, projectContractPrivateKey]).send();
    }

    it('Default root should be correct', async () => {
        await localDeploy();
        expect(projectContract.nextProjectId.get()).toEqual(Field(0));
        expect(projectContract.memberRoot.get()).toEqual(
            DefaultRootForProjectTree
        );
        expect(projectContract.ipfsHashRoot.get()).toEqual(
            DefaultRootForProjectTree
        );
        expect(projectContract.treasuryAddressRoot.get()).toEqual(
            DefaultRootForProjectTree
        );
        expect(projectContract.actionState.get()).toEqual(
            Reducer.initialActionState
        );
    });
});
