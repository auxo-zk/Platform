import fs from 'fs';
import {
    Cache,
    Field,
    Mina,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    fetchAccount,
} from 'o1js';
import { Config, JSONKey, Key } from '../../helper/config.js';
import {
    ContractList,
    compile,
    wait,
    proveAndSend,
} from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
    ProjectContract,
    ProjectAction,
    CreateProject,
    CreateProjectInput,
    ProjectProof,
} from '../../../contracts/Project.js';
import {
    MemberStorage,
    InfoStorage,
    MemberArray,
    InfoStorage as ProjectInfoStorage,
    AddressStorage as PayeeStorage,
    EMPTY_LEVEL_2_TREE,
    Level2Witness,
} from '../../../contracts/ProjectStorage.js';
import axios from 'axios';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';

// Da test reduce 1 action, 2 action co the sai :v
async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(CreateProject, cache);
    await compile(ProjectContract, cache);

    const projectAddress = process.env.BERKELEY_PROJECT_ADDRESS as string;
    const projectContract = new ProjectContract(
        PublicKey.fromBase58(projectAddress)
    );

    // Storage
    let memberStorage = new MemberStorage();
    let projectInfoStorage = new ProjectInfoStorage();
    let payeeStorage = new PayeeStorage();

    // Fetch storage trees
    const projects = (await axios.get('https://api.auxo.fund/v0/projects/'))
        .data;

    // Build storage
    projects.map((project: any) => {
        if (Boolean(project.active)) {
            console.log('projectId: ', project.projectId);
            let level2Tree = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < project.members.length; i++) {
                level2Tree.setLeaf(
                    BigInt(i),
                    MemberArray.hash(PublicKey.fromBase58(project.members[i]))
                );
            }
            memberStorage.updateInternal(Field(project.projectId), level2Tree);
            projectInfoStorage.updateLeaf(
                {
                    level1Index: Field(project.projectId),
                },
                projectInfoStorage.calculateLeaf(
                    IPFSHash.fromString(project.ipfsHash)
                )
            );
            payeeStorage.updateLeaf(
                {
                    level1Index: Field(project.projectId),
                },
                payeeStorage.calculateLeaf(
                    PublicKey.fromBase58(project.payeeAccount)
                )
            );
        }
    });

    // Do this and state value of contract is fetched in Mina
    const rawState = (await fetchZkAppState(projectAddress)) || [];

    const fromState = projectContract.lastRolledUpActionState.get();
    const rawActions = await fetchActions(projectAddress, fromState);

    const actions: ProjectAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return ProjectAction.fromFields(action);
    });

    const reduceActions = actions;

    if (reduceActions.length == 0) return;

    console.log('CreateProject.firstStep...');
    let proof = await CreateProject.firstStep(
        projectContract.nextProjectId.get(),
        projectContract.memberTreeRoot.get(),
        projectContract.projectInfoTreeRoot.get(),
        projectContract.payeeTreeRoot.get(),
        projectContract.lastRolledUpActionState.get()
    );

    let nextProjectId = Number(projectContract.nextProjectId.get());
    for (let i = 0; i < reduceActions.length; i++) {
        console.log(`${i} - CreateProject.nextStep...`);
        console.log('Create projectId: ', nextProjectId + i);
        proof = await CreateProject.nextStep(
            proof,
            reduceActions[i],
            memberStorage.getLevel1Witness(
                memberStorage.calculateLevel1Index(Field(nextProjectId + i))
            ),
            projectInfoStorage.getLevel1Witness(
                projectInfoStorage.calculateLevel1Index(
                    Field(nextProjectId + i)
                )
            ),
            payeeStorage.getLevel1Witness(
                payeeStorage.calculateLevel1Index(Field(nextProjectId + i))
            )
        );

        let tree1 = EMPTY_LEVEL_2_TREE();
        let memberArray = reduceActions[i].members;
        for (let i = 0; i < Number(memberArray.length); i++) {
            tree1.setLeaf(
                BigInt(i),
                MemberArray.hash(memberArray.get(Field(i)))
            );
        }

        // update storage:
        memberStorage.updateInternal(Field(nextProjectId + i), tree1);
        projectInfoStorage.updateLeaf(
            {
                level1Index: Field(nextProjectId + i),
            },
            projectInfoStorage.calculateLeaf(reduceActions[i].ipfsHash)
        );
        payeeStorage.updateLeaf(
            {
                level1Index: Field(nextProjectId + i),
            },
            payeeStorage.calculateLeaf(reduceActions[i].payeeAccount)
        );

        console.log('DONE');
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            projectContract.rollup(proof);
        }
    );
    await proveAndSend(tx, feePayer.key, 'ProjectContract', 'rollup');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
