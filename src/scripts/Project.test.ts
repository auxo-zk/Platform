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
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions } from 'o1js/dist/node/lib/mina';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';
import { INSTANCE_LIMITS } from '../Constants';

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

    beforeEach(async () => {
        const Local = Mina.LocalBlockchain({ proofsEnabled });
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        projectContractPrivateKey = PrivateKey.random();
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);
        await localDeploy();
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

    it('Test success flow', async () => {
        const members = new MemberArray();
        let nextProjectId = Field(0);
        const memberTree = new ProjectMemberStorage();
        const ipfsHashTree = new IpfsHashStorage();
        const treasuryAddressTree = new TreasuryAddressStorage();

        members.push(senderAccount);
        for (let i = 0; i < ProjectMockData[0].members.length; i++) {
            members.push(PublicKey.fromBase58(ProjectMockData[0].members[i]));
        }
        let tx = await Mina.transaction(senderAccount, () => {
            projectContract.createProject(
                members,
                IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
            );
        });
        await tx.prove();
        await tx.sign([senderKey]).send();
        let actions: Action[] = (await fetchActions(
            projectContractPublicKey
        )) as Action[];
        expect(actions.length).toEqual(1);

        let projectAction = ProjectAction.fromFields(
            Utilities.stringArrayToFields(actions[0].actions[0])
        );
        let proof = await RollupProject.firstStep(
            nextProjectId,
            memberTree.root,
            ipfsHashTree.root,
            treasuryAddressTree.root,
            projectContract.actionState.get()
        );
        proof = await RollupProject.createProjectStep(
            proof,
            projectAction,
            memberTree.getLevel1Witness(nextProjectId),
            ipfsHashTree.getLevel1Witness(nextProjectId),
            treasuryAddressTree.getLevel1Witness(nextProjectId)
        );

        tx = await Mina.transaction(senderAccount, () => {
            projectContract.rollup(proof);
        });
        await tx.prove();
        await tx.sign([senderKey]).send();

        const memberTreeLevel2 = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();
        memberTreeLevel2.setLeaf(
            0n,
            ProjectMemberStorage.calculateLeaf(senderAccount)
        );
        for (let i = 0; i < ProjectMockData[0].members.length; i++) {
            memberTreeLevel2.setLeaf(
                BigInt(i + 1),
                ProjectMemberStorage.calculateLeaf(
                    PublicKey.fromBase58(ProjectMockData[0].members[i])
                )
            );
        }
        memberTree.updateInternal(nextProjectId, memberTreeLevel2);
        ipfsHashTree.updateLeaf(
            { level1Index: nextProjectId },
            IpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
        );
        treasuryAddressTree.updateLeaf(
            { level1Index: nextProjectId },
            TreasuryAddressStorage.calculateLeaf(projectAction.treasuryAddress)
        );
        nextProjectId = nextProjectId.add(1);

        expect(memberTree.root).toEqual(projectContract.memberRoot.get());
        expect(ipfsHashTree.root).toEqual(projectContract.ipfsHashRoot.get());
        expect(treasuryAddressTree.root).toEqual(
            projectContract.treasuryAddressRoot.get()
        );

        tx = await Mina.transaction(senderAccount, () => {
            projectContract.updateProject(
                Field(0),
                IpfsHash.fromString(ProjectMockData[1].ipfsHash),
                memberTree.getLevel1Witness(Field(0)),
                memberTree.getLevel2Witness(Field(0), Field(0))
            );
        });
        await tx.prove();
        await tx.sign([senderKey]).send();
        actions = (await fetchActions(projectContractPublicKey)) as Action[];
        expect(actions.length).toEqual(2);
        projectAction = ProjectAction.fromFields(
            Utilities.stringArrayToFields(actions[1].actions[0])
        );
        proof = await RollupProject.firstStep(
            nextProjectId,
            memberTree.root,
            ipfsHashTree.root,
            treasuryAddressTree.root,
            projectContract.actionState.get()
        );

        proof = await RollupProject.updateProjectStep(
            proof,
            projectAction,
            IpfsHash.fromString(ProjectMockData[0].ipfsHash),
            ipfsHashTree.getLevel1Witness(Field(0))
        );

        tx = await Mina.transaction(senderAccount, () => {
            projectContract.rollup(proof);
        });
        await tx.prove();
        await tx.sign([senderKey]).send();

        ipfsHashTree.updateLeaf(
            { level1Index: Field(0) },
            IpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
        );

        expect(ipfsHashTree.root).toEqual(projectContract.ipfsHashRoot.get());
    });
});
