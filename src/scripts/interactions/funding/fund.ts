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

    // Compile programs
    // await compile(CreateReduceProof, cache);
    // await compile(CreateRollupProof, cache);
    // await compile(FundingContract, cache);

    const fundingAddress =
        'B62qoGy5GKNRaa2P8uh4ppdRqnCVjNyHqVSsaD4JMcE6FawLRKmmN4u';
    const participationAddress =
        'B62qqnpYUoCsDYeK71o25roU13WYjPX1HZKQ47UzvzBScXA3n5eQQLi';
    const fundingContract = new FundingContract(
        PublicKey.fromBase58(fundingAddress)
    );

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(fundingAddress);
    await fetchZkAppState(participationAddress);

    // Project storage
    let requestIdStorage = new RequestIdStorage();
    // Participation storage
    let valueStorage = new ValueStorage();
    let fundingAddressStorage = new AddressStorage(addressMerkleTree);
    console.log('Root: ', fundingAddressStorage.root);

    // Fetch storage trees
    const projectsInCampaign = (
        await axios.get(
            `https://api.auxo.fund/v0/campaigns/${campaignId}/projects`
        )
    ).data;

    // Build storage
    // IndexStorage
    // RequestIdStorage

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
        committeePublicKey: PublicKey.fromBase58(
            'B62qph1Mj9atGbPUqDszvwFJ3LVGoXWkNjoDura5kjkK6Pw15UHHDZy'
        ),
        secretVector: secretVectors[0],
        random: randomsVectors[0],
        treasuryContract: fundingAddressStorage.getZkAppRef(
            ZkAppEnum.TREASURY,
            // Treasury address
            PublicKey.fromBase58(
                'B62qpKo4mxwp9eZqisM3KS2xHK8i4GMKJoeTt1768sWzi9TWXidioYK'
            )
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
