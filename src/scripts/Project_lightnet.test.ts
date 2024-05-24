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
} from '../contracts/Project.js';
import { ProjectMockData } from './mock/ProjectMockData.js';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage.js';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { Action } from './interfaces/action.interface.js';
import { Utilities } from './utils.js';

import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { compile } from './helper/compile.js';
import { Utils } from '@auxo-dev/auxo-libs';

let proofsEnabled = true;

describe('Project', () => {
    const logger = {
        info: true,
        error: true,
    };

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContractPrivateKey: PrivateKey,
        projectContract: ProjectContract;
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    let nextProjectId = Field(0);
    const memberTree = new ProjectMemberStorage();
    const ipfsHashTree = new IpfsHashStorage();
    const treasuryAddressTree = new TreasuryAddressStorage();
    let _: any;
    let projectZkApp: Utils.ZkApp;

    beforeAll(async () => {
        _ = await prepare(
            './caches',
            { type: Network.Lightnet, doProofs: true },
            {
                aliases: ['project'],
            }
        );

        await Utils.compile(RollupProject, _.cache, undefined, logger);
        await Utils.compile(ProjectContract, _.cache, undefined, logger);

        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            _.accounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } = _.accounts[1]);

        projectContractPrivateKey = _.accounts.project.privateKey;
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);
        // await localDeploy();
    });

    async function localDeploy() {
        projectZkApp = Utils.getZkApp(
            _.accounts.project,
            new ProjectContract(_.accounts.project.publicKey),
            ProjectContract.name
        );

        await Utils.deployZkApps([projectZkApp], _.feePayer, true, logger);
    }

    // it('Default root should be correct', async () => {
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

    describe('Test success flow', () => {
        // it('1. Create project', async () => {
        //     const members = new MemberArray();
        //     members.push(senderAccount);
        //     for (let i = 0; i < ProjectMockData[0].members.length; i++) {
        //         members.push(
        //             PublicKey.fromBase58(ProjectMockData[0].members[i])
        //         );
        //     }

        //     await Utils.proveAndSendTx(
        //         ProjectContract.name,
        //         'create',
        //         async () => {
        //             await projectContract.createProject(
        //                 members,
        //                 IpfsHash.fromString(ProjectMockData[0].ipfsHash),
        //                 PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
        //             );
        //         },
        //         _.feePayer,
        //         true,
        //         undefined,
        //         logger
        //     );

        //     const actions: Action[] = (await Mina.fetchActions(
        //         projectContractPublicKey
        //     )) as Action[];
        //     expect(actions.length).toEqual(1);
        // });

        it('2. Rollup', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);

            const projectAction = ProjectAction.fromFields(
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

            await Utils.proveAndSendTx(
                ProjectContract.name,
                'rollup',
                async () => {
                    await projectContract.rollup(proof);
                },
                _.feePayer,
                true,
                undefined,
                logger
            );

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
                TreasuryAddressStorage.calculateLeaf(
                    projectAction.treasuryAddress
                )
            );
            nextProjectId = nextProjectId.add(1);

            expect(nextProjectId).toEqual(projectContract.nextProjectId.get());
            expect(memberTree.root).toEqual(projectContract.memberRoot.get());
            expect(ipfsHashTree.root).toEqual(
                projectContract.ipfsHashRoot.get()
            );
            expect(treasuryAddressTree.root).toEqual(
                projectContract.treasuryAddressRoot.get()
            );
        });

        it('3. Update project', async () => {
            await Utils.proveAndSendTx(
                ProjectContract.name,
                'updateProject',
                async () => {
                    await projectContract.updateProject(
                        Field(0),
                        IpfsHash.fromString(ProjectMockData[1].ipfsHash),
                        memberTree.getLevel1Witness(Field(0)),
                        memberTree.getLevel2Witness(Field(0), Field(0))
                    );
                },
                _.feePayer,
                true,
                undefined,
                logger
            );

            const actions = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
        });

        it('4. Rollup', async () => {
            const actions = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
            const projectAction = ProjectAction.fromFields(
                Utilities.stringArrayToFields(actions[1].actions[0])
            );
            let proof = await RollupProject.firstStep(
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

            await Utils.proveAndSendTx(
                ProjectContract.name,
                'rollup',
                async () => {
                    await projectContract.rollup(proof);
                },
                _.feePayer,
                true,
                undefined,
                logger
            );

            ipfsHashTree.updateLeaf(
                { level1Index: Field(0) },
                IpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
            );

            expect(ipfsHashTree.root).toEqual(
                projectContract.ipfsHashRoot.get()
            );
        });
    });
});
