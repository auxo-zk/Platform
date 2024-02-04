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
} from '../../../contracts/ProjectStorage.js';
import axios from 'axios';
import { IPFSHash, CustomScalar } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';
import {
    AddressStorage,
    getZkAppRef,
    ReduceStorage,
    ActionStatus,
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
} from '../../../contracts/FundingStorage.js';
import { ZkAppEnum } from '../../../constants.js';
import { CustomScalarArray, ZkApp } from '@auxo-dev/dkg';

async function main() {
    const { cache, feePayer, addressMerkleTree } = await prepare();

    // Compile programs
    await compile(CreateReduceProof, cache);
    await compile(CreateRollupProof, cache);
    await compile(FundingContract, cache);

    const fundingAddress = process.env.BERKELEY_FUNDING_ADDRESS as string;
    const fundingContract = new FundingContract(
        PublicKey.fromBase58(fundingAddress)
    );

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(fundingAddress);

    // Fetch storage
    const actionStatus = (
        await axios.get('https://api.auxo.fund/v0/funding/reduce/leafs')
    ).data; // Nam viet them cai nay nha, chua co dau t viet tam script mau~ thoi chu chua chay

    // Build storage
    let fundingReduceStorage = new ReduceStorage();
    for (let key in actionStatus) {
        fundingReduceStorage.updateLeaf(
            Field(key),
            Field(actionStatus[key]['leaf'])
        );
    }

    let reduceFundingProof = await CreateReduceProof.firstStep(
        fundingContract.actionState.get(),
        fundingContract.actionStatus.get()
    );

    const lastReduceActionState = fundingContract.actionState.get();
    const rawAllActions = await fetchActions(fundingAddress);

    const allActions: FundingAction[] = rawAllActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return FundingAction.fromFields(action);
    });

    const rawReduceActions = await fetchActions(
        fundingAddress,
        lastReduceActionState
    );
    const reduceAction: FundingAction[] = rawReduceActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return FundingAction.fromFields(action);
    });

    let index = rawAllActions.findIndex((obj) =>
        Field(obj.hash).equals(lastReduceActionState).toBoolean()
    );

    for (let i = 0; i < reduceAction.length; i++) {
        console.log('Step', i);
        reduceFundingProof = await CreateReduceProof.nextStep(
            reduceFundingProof,
            reduceAction[i],
            fundingReduceStorage.getWitness(
                Field(rawAllActions[index + 1 + i].hash)
            )
        );

        // update storage:
        fundingReduceStorage.updateLeaf(
            fundingReduceStorage.calculateIndex(
                Field(rawAllActions[index + 1 + i].hash)
            ),
            fundingReduceStorage.calculateLeaf(ActionStatus.REDUCED)
        );
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            fundingContract.reduce(reduceFundingProof);
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
