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
    Group,
    MerkleMap,
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
import {
    TreasuryContract,
    ClaimFund,
    TreasuryAction,
    ClaimFundInput,
    InvestVector,
} from '../../../contracts/Treasury.js';
import { ClaimedStorage } from '../../../contracts/TreasuryStorage.js';
import { ZkAppEnum } from '../../../constants.js';
import { CustomScalarArray, ZkApp, Storage } from '@auxo-dev/dkg';

async function main() {
    const { cache, feePayer, addressMerkleTree } = await prepare();

    const campaignId = 1;
    const projectId = 1;
    const projectIndex = 1;
    const requestId = 1;

    // Compile programs
    // await compile(ClaimFund, cache);
    // await compile(TreasuryContract, cache);

    const treasuryAddress =
        'B62qpKo4mxwp9eZqisM3KS2xHK8i4GMKJoeTt1768sWzi9TWXidioYK';
    const participationAddress =
        'B62qqnpYUoCsDYeK71o25roU13WYjPX1HZKQ47UzvzBScXA3n5eQQLi';
    const treasuryContract = new TreasuryContract(
        PublicKey.fromBase58(treasuryAddress)
    );

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(treasuryAddress);
    await fetchZkAppState(participationAddress);

    // Build storage
    // Participation storage
    let indexStorage = new IndexStorage();

    // Treasury storage
    let claimedStorage = new ClaimedStorage();
    let treasuryAddressStorage = new AddressStorage(addressMerkleTree);
    // Request storage:
    let DStorage = new MerkleMap();

    // Fetch storage trees
    const projectsInCampaign = (
        await axios.get(
            `https://api.auxo.fund/v0/campaigns/${campaignId}/projects`
        )
    ).data;

    let randomPrivateKey = PrivateKey.fromBase58(
        'EKE3xkv6TyhxSzBPeiiAppDfKsJVp7gXS7iuS2RNj8TGJvvhG6FM'
    );
    let randomPublickey = randomPrivateKey.toPublicKey();
    // mock sumD value
    let sumD = ZkApp.Request.RequestVector.from([
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
    ]);

    // earn each 0.01 total 0.02
    let investVectors = InvestVector.from([
        Field(1e7),
        Field(0),
        Field(1e7),
        Field(0),
    ]);

    let tempSumM = [];

    for (let i = 0; i < Number(investVectors.length); i++) {
        let temp = Group.generator.scale(
            Scalar.from(investVectors.get(Field(i)).toBigInt())
        );
        tempSumM.push(temp.add(sumD.get(Field(i))));
    }

    let sumM = ZkApp.Request.RequestVector.from(tempSumM);

    let input = new ClaimFundInput({
        campaignId: Field(campaignId),
        projectId: Field(projectId),
        requestId: Field(requestId),
        // address to recive fund
        payeeAccount: PublicKey.fromBase58(''),
        M: sumM,
        D: sumD,
        DWitness: DStorage.getWitness(Field(requestId)),
        investVector: investVectors,
        participationIndexWitness: indexStorage.getLevel1Witness(
            indexStorage.calculateLevel1Index({
                campaignId: Field(campaignId),
                projectId: Field(projectId),
            })
        ),
        claimedIndex: claimedStorage.getLevel1Witness(
            claimedStorage.calculateLevel1Index({
                campaignId: Field(campaignId),
                projectId: Field(projectId),
            })
        ),
        participationRef: getZkAppRef(
            treasuryAddressStorage.addressMap,
            ZkAppEnum.PARTICIPATION,
            // Participation address
            PublicKey.fromBase58(
                'B62qorbP6mCWU6crpr6MfYBfCfXctwn9qj2KZAHcTDS9Yz4VynB3zih'
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
            treasuryContract.claimFund(input);
        }
    );
    await proveAndSend(tx, feePayer.key, 'treasury', 'claimFund');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
