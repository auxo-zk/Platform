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
    getStatusFromNumber,
} from '../../../contracts/CampaignStorage.js';
import { AddressStorage } from '../../../contracts/SharedStorage.js';
import axios from 'axios';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';
import { Prover } from 'o1js/dist/node/lib/proof_system.js';

// Da test reduce 1 action, 2 action co the sai :v
async function main() {
    const { cache, feePayer } = await prepare();
    // Compile programs
    await compile(CreateCampaign, cache);
    await compile(CampaignContract, cache);

    const zkAppAddress = process.env.BERKELEY_CAMPAIGN_ADDRESS as string;
    const zkContract = new CampaignContract(PublicKey.fromBase58(zkAppAddress));

    // Do this and state value of contract is fetched in Mina
    await fetchZkAppState(zkAppAddress);
    let nextCampaignId = Number(zkContract.nextCampaignId.get());

    // Storage
    let campaignInfoStorage = new CampaignInfoStorage();
    let ownerStorage = new OwnerStorage();
    let statusStorage = new StatusStorage();
    let configStorage = new ConfigStorage();

    // Fetch storage trees
    const campaigns = (
        await axios.get(`https://api.auxo.fund/v0/campaigns/all?active=true`)
    ).data;

    console.log('Campaigns: ', campaigns);

    // Build storage
    for (let i = 0; i < campaigns.length; i++) {
        let campaign = campaigns[i];
        console.log('Campaign id: ', campaign.campaignId);

        ownerStorage.updateLeaf(
            Field(campaign.campaignId),
            ownerStorage.calculateLeaf(PublicKey.fromBase58(campaign.owner))
        );

        campaignInfoStorage.updateLeaf(
            Field(campaign.campaignId),
            campaignInfoStorage.calculateLeaf(
                IPFSHash.fromString(campaign.ipfsHash)
            )
        );

        statusStorage.updateLeaf(
            Field(campaign.campaignId),
            statusStorage.calculateLeaf(
                getStatusFromNumber(Number(campaign.status))
            )
        );

        configStorage.updateLeaf(
            Field(campaign.campaignId),
            configStorage.calculateLeaf({
                committeeId: Field(campaign.committeeId),
                keyId: Field(campaign.keyId),
            })
        );
    }

    Provable.log('ownerStorage: ', ownerStorage.level1.getRoot());
    Provable.log('campaignInfoStorage: ', campaignInfoStorage.level1.getRoot());
    Provable.log('statusStorage: ', statusStorage.level1.getRoot());
    Provable.log('configStorage: ', configStorage.level1.getRoot());

    const fromState = zkContract.lastRolledUpActionState.get();
    // const fromState = Reducer.initialActionState;
    const rawActions = await fetchActions(zkAppAddress, fromState);
    console.log('rawActions: ', rawActions);

    const reduceActions: CampaignAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return CampaignAction.fromFields(action);
    });

    console.log('CreateCampaign.firstStep...');
    let proof = await CreateCampaign.firstStep(
        zkContract.ownerTreeRoot.get(),
        zkContract.infoTreeRoot.get(),
        zkContract.statusTreeRoot.get(),
        zkContract.configTreeRoot.get(),
        Field(nextCampaignId),
        zkContract.lastRolledUpActionState.get()
    );

    for (let i = 0; i < reduceActions.length; i++) {
        let action = reduceActions[i];
        console.log(`${i} - CreateCampaign.createCampaign...`);

        proof = await CreateCampaign.createCampaign(
            proof,
            action,
            ownerStorage.getLevel1Witness(
                ownerStorage.calculateLevel1Index(Field(nextCampaignId + i))
            ),
            campaignInfoStorage.getLevel1Witness(
                campaignInfoStorage.calculateLevel1Index(
                    Field(nextCampaignId + i)
                )
            ),
            statusStorage.getLevel1Witness(
                statusStorage.calculateLevel1Index(Field(nextCampaignId + i))
            ),
            configStorage.getLevel1Witness(
                configStorage.calculateLevel1Index(Field(nextCampaignId + i))
            )
        );

        // update storage:
        ownerStorage.updateLeaf(
            Field(nextCampaignId + i),
            ownerStorage.calculateLeaf(action.owner)
        );
        campaignInfoStorage.updateLeaf(
            Field(nextCampaignId + i),
            campaignInfoStorage.calculateLeaf(action.ipfsHash)
        );
        statusStorage.updateLeaf(
            Field(nextCampaignId + i),
            statusStorage.calculateLeaf(StatusEnum.APPLICATION)
        );
        configStorage.updateLeaf(
            Field(nextCampaignId + i),
            configStorage.calculateLeaf({
                committeeId: action.committeeId,
                keyId: action.keyId,
            })
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
            zkContract.rollup(proof);
        }
    );
    await proveAndSend(tx, feePayer.key, 'CampaignContract', 'rollup');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
