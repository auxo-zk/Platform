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
    Scalar,
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
import {
    MemberStorage,
    Level2Witness,
    EMPTY_LEVEL_2_TREE,
    MemberArray,
} from '../../../contracts/ProjectStorage.js';
import axios from 'axios';
import { IPFSHash, CustomScalar } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';
import {
    AddressStorage,
    getZkAppRef,
} from '../../../contracts/SharedStorage.js';
import {
    FundingContract,
    CreateReduceProof,
    CreateRollupProof,
    FundingAction,
    FundingInput,
} from '../../../contracts/Funding.js';
import {
    RequestIdStorage,
    ValueStorage,
    TotalFundStorage,
} from '../../../contracts/FundingStorage.js';
import { ZkAppEnum, INSTANCE_LIMITS } from '../../../constants.js';
import { ReduceStorage } from '../../../contracts/SharedStorage.js';
import { CustomScalarArray, ZkApp } from '@auxo-dev/dkg';

async function main() {
    const { cache, feePayer, addressMerkleTree } = await prepare();

    // Decide to rollup campaign with id: 1 which using committeeId, keyId
    const campaignId = 1;
    const committeeId = 1;
    const keyId = 1;

    // Compile programs
    await compile(CreateReduceProof, cache);
    await compile(CreateRollupProof, cache);
    await compile(FundingContract, cache);

    const fundingAddress = process.env.BERKELEY_FUNDING_ADDRESS as string;
    const participationAddress = process.env
        .BERKELEY_PARTICIPATION_ADDRESS as string;
    const requestContractAddress = process.env
        .BERKELEY_REQUEST_ADDRESS as string;

    const fundingContract = new FundingContract(
        PublicKey.fromBase58(fundingAddress)
    );

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(fundingAddress);
    await fetchZkAppState(participationAddress);

    // Storage
    // Project
    let memberStorage = new MemberStorage();
    // Participation
    let counterStorage = new CounterStorage();
    let indexStorage = new IndexStorage();
    // Funding storage
    let requestIdStorage = new RequestIdStorage();
    let totalRStorage = new ValueStorage();
    let totalMStorage = new ValueStorage();
    let fundingReduceStorage = new ReduceStorage();
    let totalFundStorage = new TotalFundStorage();
    let fundingAddressStorage = new AddressStorage(addressMerkleTree);

    // Fetch storage trees
    const [
        actionStatus,
        projects,
        indexLeaf,
        counter,
        requestId,
        totalR,
        totalM,
        totalFund,
    ] = await Promise.all([
        (
            await axios.get('https://api.auxo.fund/v0/funding/reduce/leafs')
        ).data, // Nam code them nha
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
                'https://api.auxo.fund/v0/storages/funding/request-id/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/funding/total-r/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/funding/total-m/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/funding/total-fund/leafs'
            )
        ).data, // Nam code them nha
    ]);

    for (let key in actionStatus) {
        fundingReduceStorage.updateLeaf(
            Field(key),
            Field(actionStatus[key]['leaf'])
        );
    }

    for (let key in indexLeaf) {
        indexStorage.updateLeaf(Field(key), Field(indexLeaf[key]['leaf']));
    }

    for (let key in counter) {
        counterStorage.updateLeaf(Field(key), Field(counter[key]['leaf']));
    }

    for (let key in requestId) {
        requestIdStorage.updateLeaf(Field(key), Field(requestId[key]['leaf']));
    }

    for (let key in totalR) {
        totalRStorage.updateLeaf(Field(key), Field(totalR[key]['leaf']));
    }

    for (let key in totalM) {
        totalMStorage.updateLeaf(Field(key), Field(totalM[key]['leaf']));
    }

    for (let key in totalFund) {
        totalFundStorage.updateLeaf(Field(key), Field(totalFund[key]['leaf']));
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

    const lastReduceActionState = fundingContract.actionState.get();
    const rawAllActions = await fetchActions(fundingAddress);
    const rawReduceActions = await fetchActions(
        fundingAddress,
        lastReduceActionState
    );

    const actions: FundingAction[] = rawReduceActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return FundingAction.fromFields(action);
    });

    let index = rawAllActions.findIndex((obj) =>
        Field(obj.hash).equals(lastReduceActionState).toBoolean()
    );

    const reduceActions = actions;
    console.log('reduceActions: ', reduceActions);

    console.log('CreateRollupProof.firstStep...');
    let proof = await CreateRollupProof.firstStep(
        Field(campaignId),
        Field(INSTANCE_LIMITS.PARTICIPATION),
        fundingContract.actionStatus.get()
    );

    // Note: Each campaign will only rollup once, so we only rollup it when the time condition meet
    let tempToShowOny = 1;
    for (let i = 0; i < reduceActions.length; i++) {
        if (Number(reduceActions[i].campaignId) == campaignId) {
            console.log('Step: ', tempToShowOny);
            proof = await CreateRollupProof.nextStep(
                proof,
                reduceActions[i],
                Field(rawAllActions[index + i].hash), // previous action hash
                fundingReduceStorage.getWitness(
                    Field(rawAllActions[index + 1 + i].hash)
                )
            );
            tempToShowOny++;
        }
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            fundingContract.rollupRequest(
                proof,
                Field(committeeId),
                Field(keyId),
                totalRStorage.getLevel1Witness(
                    totalRStorage.calculateLevel1Index(Field(campaignId))
                ),
                totalMStorage.getLevel1Witness(
                    totalMStorage.calculateLevel1Index(Field(campaignId))
                ),
                requestIdStorage.getLevel1Witness(
                    requestIdStorage.calculateLevel1Index(Field(campaignId))
                ),
                totalFundStorage.getLevel1Witness(
                    requestIdStorage.calculateLevel1Index(Field(campaignId))
                ),
                fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.REQUEST,
                    PublicKey.fromBase58(requestContractAddress)
                )
            );
        }
    );
    await proveAndSend(tx, feePayer.key, 'funding', 'fund');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
