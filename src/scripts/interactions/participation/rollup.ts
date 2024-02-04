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
    Poseidon,
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
import {
    CampaignContract,
    CreateCampaign,
    CreateCampaignInput,
    CampaignAction,
} from '../../../contracts/Campaign.js';
import {
    InfoStorage as CampaignInfoStorage,
    OwnerStorage,
    StatusStorage,
    ConfigStorage,
    StatusEnum,
} from '../../../contracts/CampaignStorage.js';
import {
    AddressStorage,
    ZkAppRef,
    AddressWitness,
} from '../../../contracts/SharedStorage.js';
import {
    ParticipationContract,
    JoinCampaign,
    ParticipationAction,
    JoinCampaignInput,
} from '../../../contracts/Participation.js';
import {
    InfoStorage as ParticipationInfoStorage,
    CounterStorage,
    IndexStorage,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_1_COMBINED_TREE,
} from '../../../contracts/ParticipationStorage.js';
import axios from 'axios';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';
import { ZkApp } from '@auxo-dev/dkg';
import { Contract, ZkAppEnum } from '../../../constants.js';

// Da test reduce 1 action, 2 action co the sai :v
async function main() {
    const { cache, feePayer, addressMerkleTree } = await prepare();

    // Compile programs
    await compile(JoinCampaign, cache);
    await compile(ParticipationContract, cache);

    const projectAddress = process.env.BERKELEY_PROJECT_ADDRESS as string;
    const participationAddress = process.env
        .BERKELEY_PARTICIPATION_ADDRESS as string;
    const campaignAddress = process.env.BERKELEY_CAMPAIGN_ADDRESS as string;

    const participationContract = new ParticipationContract(
        PublicKey.fromBase58(participationAddress)
    );
    const campaignContract = new CampaignContract(
        PublicKey.fromBase58(campaignAddress)
    );

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(projectAddress);
    await fetchZkAppState(participationAddress);
    await fetchZkAppState(campaignAddress);

    let nextCampaignId = Number(campaignContract.nextCampaignId.get());

    // Storage
    // Project
    let memberStorage = new MemberStorage();
    // Participation
    let participationInfoStorage = new ParticipationInfoStorage();
    let counterStorage = new CounterStorage();
    let indexStorage = new IndexStorage();

    // Fetch storage trees
    const [projects, index, counter, info] = await Promise.all([
        (await axios.get('https://api.auxo.fund/v0/projects/')).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/participation/index/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/participation/counter/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/participation/info/leafs'
            )
        ).data,
    ]);

    for (let key in index) {
        indexStorage.updateLeaf(Field(key), Field(index[key]['leaf']));
    }

    for (let key in counter) {
        counterStorage.updateLeaf(Field(key), Field(index[key]['leaf']));
    }

    for (let key in info) {
        participationInfoStorage.updateLeaf(
            Field(key),
            Field(index[key]['leaf'])
        );
    }

    // Build storage
    projects.map((project: any) => {
        if (Boolean(project.active)) {
            let level2Tree = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < project.members.length; i++) {
                level2Tree.setLeaf(
                    BigInt(i),
                    MemberArray.hash(PublicKey.fromBase58(project.members[i]))
                );
            }
            memberStorage.updateInternal(Field(project.projectId), level2Tree);
        }
    });

    const fromState = participationContract.lastRolledUpActionState.get();
    const rawActions = await fetchActions(participationAddress, fromState);

    const actions: ParticipationAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return ParticipationAction.fromFields(action);
    });

    const reduceActions = actions;
    console.log('reduceActions: ', reduceActions);

    console.log('JoinCampaign.firstStep...');
    let proof = await JoinCampaign.firstStep(
        participationContract.indexTreeRoot.get(),
        participationContract.infoTreeRoot.get(),
        participationContract.counterTreeRoot.get(),
        participationContract.lastRolledUpActionState.get()
    );

    for (let i = 0; i < reduceActions.length; i++) {
        let action = reduceActions[i];
        console.log(`${i} - JoinCampaign.joinCampaign...`);

        proof = await JoinCampaign.joinCampaign(
            proof,
            action,
            indexStorage.getLevel1Witness(
                indexStorage.calculateLevel1Index({
                    campaignId: action.campaignId,
                    projectId: action.projectId,
                })
            ),
            participationInfoStorage.getLevel1Witness(
                participationInfoStorage.calculateLevel1Index({
                    campaignId: action.campaignId,
                    projectId: action.projectId,
                })
            ),
            Field(i), // current campaign counter - number of participant
            counterStorage.getLevel1Witness(
                counterStorage.calculateLevel1Index(action.campaignId)
            )
        );

        // update storage:
        indexStorage.updateLeaf(
            indexStorage.calculateLevel1Index({
                campaignId: action.campaignId,
                projectId: action.projectId,
            }),
            indexStorage.calculateLeaf(Field(i + 1)) // index start from 1
        );

        participationInfoStorage.updateLeaf(
            participationInfoStorage.calculateLevel1Index({
                campaignId: action.campaignId,
                projectId: action.projectId,
            }),
            participationInfoStorage.calculateLeaf(action.participationInfo)
        );
        counterStorage.updateLeaf(
            counterStorage.calculateLevel1Index(action.campaignId),
            counterStorage.calculateLeaf(Field(i + 1))
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
            participationContract.rollup(proof);
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
