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

    const campaignId = 1;
    const projectId = 1;
    const committeePublicKey = PublicKey.fromBase58(
        'B62qph1Mj9atGbPUqDszvwFJ3LVGoXWkNjoDura5kjkK6Pw15UHHDZy'
    );

    // Compile programs
    // await compile(CreateReduceProof, cache);
    // await compile(CreateRollupProof, cache);
    // await compile(FundingContract, cache);

    const fundingAddress = process.env.BERKELEY_FUNDING_ADDRESS as string;
    const campaignAddress = process.env.BERKELEY_CAMPAIGN_ADDRESS as string;
    const participationAddress = process.env
        .BERKELEY_PARTICIPATION_ADDRESS as string;
    const treasuryAddress = process.env.BERKELEY_TREASURY_ADDRESS as string;
    const fundingContract = new FundingContract(
        PublicKey.fromBase58(fundingAddress)
    );

    // Campaign storage
    let statusStorage = new StatusStorage();

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(fundingAddress);
    await fetchZkAppState(participationAddress);

    // Storage
    let fundingAddressStorage = new AddressStorage(addressMerkleTree);

    // total fund 0.02 = 2e7
    let secretVectors: CustomScalarArray[] = [
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(1e7)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(1e7)),
            CustomScalar.fromScalar(Scalar.from(0n)),
        ]),
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(1e7)),
            CustomScalar.fromScalar(Scalar.from(1e7)),
        ]),
    ];

    let randomsVectors: CustomScalarArray[] = [
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(100n)),
            CustomScalar.fromScalar(Scalar.from(200n)),
            CustomScalar.fromScalar(Scalar.from(300n)),
            CustomScalar.fromScalar(Scalar.from(400n)),
        ]),
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(500n)),
            CustomScalar.fromScalar(Scalar.from(600n)),
            CustomScalar.fromScalar(Scalar.from(700n)),
            CustomScalar.fromScalar(Scalar.from(800n)),
        ]),
    ];

    let input = new FundingInput({
        campaignId: Field(campaignId),
        // Publickey of a committee
        committeePublicKey: committeePublicKey,
        secretVector: secretVectors[0],
        random: randomsVectors[0],
        campaignStatusWitness: statusStorage.getLevel1Witness(
            statusStorage.calculateLevel1Index(Field(campaignId))
        ),
        treasuryContract: fundingAddressStorage.getZkAppRef(
            ZkAppEnum.TREASURY,
            PublicKey.fromBase58(treasuryAddress)
        ),
        campaignRef: fundingAddressStorage.getZkAppRef(
            ZkAppEnum.CAMPAIGN,
            PublicKey.fromBase58(campaignAddress)
        ),
    });

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            fundingContract.fund(input);
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
