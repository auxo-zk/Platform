import 'dotenv/config';
import {
    AccountUpdate,
    Cache,
    Mina,
    PrivateKey,
    PublicKey,
    TokenId,
} from 'o1js';
import { ZkAppStorage } from '../storages/SharedStorage.js';
import { CampaignContract, RollupCampaign } from '../contracts/Campaign.js';
import { ProjectContract, RollupProject } from '../contracts/Project.js';
import {
    ParticipationContract,
    RollupParticipation,
} from '../contracts/Participation.js';
import { FundingContract, RollupFunding } from '../contracts/Funding.js';
import {
    RollupTreasuryManager,
    TreasuryManagerContract,
} from '../contracts/TreasuryManager.js';
import { Utilities } from './utils.js';
import {
    DkgContract,
    RequestContract,
    RequesterContract,
    UpdateKey,
    UpdateRequest,
    UpdateTask,
    ZkApp,
} from '@auxo-dev/dkg';

const BerkeleyNetwork = Mina.Network({
    mina: process.env.BERKELEY_MINA as string,
    archive: process.env.BERKELEY_ARCHIVE as string,
});
const Lightnet = Mina.Network({
    mina: process.env.LIGHTNET_MINA as string,
    archive: process.env.LIGHTNET_ARCHIVE as string,
});
const MinaScanNetwork = Mina.Network({
    mina: process.env.MINA_SCAN_MINA as string,
    archive: process.env.MINA_SCAN_ARCHIVE as string,
});

const cache = Cache.FileSystem('./caches');

async function main() {
    const deployerKey = PrivateKey.fromBase58(
        process.env.DEPLOYER_SECRET_KEY as string
    );
    const deployerAccount = deployerKey.toPublicKey();
    let senderAccount: PublicKey,
        senderKey: PrivateKey,
        campaignContractPrivateKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContract: CampaignContract,
        projectContractPrivateKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContract: ProjectContract,
        participationContractPrivateKey: PrivateKey,
        participationContractPublicKey: PublicKey,
        participationContract: ParticipationContract,
        fundingContractPrivateKey: PrivateKey,
        fundingContractPublicKey: PublicKey,
        fundingContract: FundingContract,
        treasuryManagerContractPrivateKey: PrivateKey,
        treasuryManagerContractPublicKey: PublicKey,
        treasuryManagerContract: TreasuryManagerContract,
        treasuryManagerTokenContract: TreasuryManagerContract,
        fundingRequesterContractPrivateKey: PrivateKey,
        fundingRequesterContractPublicKey: PublicKey,
        // fundingRequesterContract: ZkApp.Requester.RequesterContract,
        // fundingRequesterTokenContractForFunding: ZkApp.Requester.RequesterContract,
        // fundingRequesterTokenContractForCampaign: ZkApp.Requester.RequesterContract,
        dkgContractPublicKey: PublicKey,
        requestContractPublicKey: PublicKey;

    Mina.setActiveInstance(
        Mina.Network({
            mina: process.env.LIGHTNET_MINA as string,
            archive: process.env.LIGHTNET_ARCHIVE as string,
        })
    );

    await UpdateTask.compile({ cache });
    await RequesterContract.compile({ cache });
    await UpdateKey.compile({ cache });
    await DkgContract.compile({ cache });
    await ZkApp.Request.ComputeResult.compile({ cache });
    await UpdateRequest.compile({ cache });
    await RequestContract.compile({ cache });

    await RollupProject.compile({ cache });
    await RollupCampaign.compile({ cache });
    await RollupParticipation.compile({ cache });
    await RollupFunding.compile({ cache });
    await RollupTreasuryManager.compile({ cache });

    await ProjectContract.compile({ cache });
    await CampaignContract.compile({ cache });
    await ParticipationContract.compile({ cache });
    await FundingContract.compile({ cache });
    await TreasuryManagerContract.compile({ cache });

    // projectContractPrivateKey = PrivateKey.random();
    // projectContractPublicKey = projectContractPrivateKey.toPublicKey();
    // projectContract = new ProjectContract(projectContractPublicKey);

    // campaignContractPrivateKey = PrivateKey.random();
    // campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
    // campaignContract = new CampaignContract(campaignContractPublicKey);

    // participationContractPrivateKey = PrivateKey.random();
    // participationContractPublicKey =
    //     participationContractPrivateKey.toPublicKey();
    // participationContract = new ParticipationContract(
    //     participationContractPublicKey
    // );

    // fundingContractPrivateKey = PrivateKey.random();
    // fundingContractPublicKey = fundingContractPrivateKey.toPublicKey();
    // fundingContract = new FundingContract(fundingContractPublicKey);

    // treasuryManagerContractPrivateKey = PrivateKey.random();
    // treasuryManagerContractPublicKey =
    //     treasuryManagerContractPrivateKey.toPublicKey();
    // treasuryManagerContract = new TreasuryManagerContract(
    //     treasuryManagerContractPublicKey
    // );
    // treasuryManagerTokenContract = new TreasuryManagerContract(
    //     treasuryManagerContractPublicKey,
    //     TokenId.derive(fundingContractPublicKey)
    // );

    // fundingRequesterContractPrivateKey = PrivateKey.random();
    // fundingRequesterContractPublicKey =
    //     fundingRequesterContractPrivateKey.toPublicKey();
    // fundingRequesterContract = new ZkApp.Requester.RequesterContract(
    //     fundingRequesterContractPublicKey
    // );
    // fundingRequesterTokenContractForCampaign =
    //     new ZkApp.Requester.RequesterContract(
    //         fundingRequesterContractPublicKey,
    //         TokenId.derive(campaignContractPublicKey)
    //     );

    // fundingRequesterTokenContractForFunding =
    //     new ZkApp.Requester.RequesterContract(
    //         fundingRequesterContractPublicKey,
    //         TokenId.derive(fundingContractPublicKey)
    //     );

    // dkgContractPublicKey = PublicKey.fromBase58(
    //     process.env.DKG_ADDRESS as string
    // );
    // requestContractPublicKey = PublicKey.fromBase58(
    //     process.env.REQUEST_ADDRESS as string
    // );

    // const zkAppStorage: ZkAppStorage = Utilities.getZkAppStorage({
    //     campaignAddress: campaignContractPublicKey,
    //     projectAddress: projectContractPublicKey,
    //     participationAddress: participationContractPublicKey,
    //     fundingAddress: fundingContractPublicKey,
    //     treasuryManagerAddress: treasuryManagerContractPublicKey,
    //     dkgAddress: dkgContractPublicKey,
    //     requesterAddress: fundingRequesterContractPublicKey,
    //     requestAddress: requestContractPublicKey,
    // });

    // const zkAppStorageForRequester = Utilities.getZkAppStorageForRequester(
    //     campaignContractPublicKey.toBase58(),
    //     fundingContractPublicKey.toBase58(),
    //     process.env.DKG_ADDRESS as string,
    //     process.env.REQUEST_ADDRESS as string
    // );

    // const tx = await Mina.transaction(deployerAccount, async () => {
    //     AccountUpdate.fundNewAccount(deployerAccount, 9);

    //     await projectContract.deploy();

    //     await campaignContract.deploy();
    //     campaignContract['zkAppRoot'].set(zkAppStorage.root);

    //     await participationContract.deploy();
    //     participationContract['zkAppRoot'].set(zkAppStorage.root);

    //     await fundingContract.deploy();
    //     fundingContract['zkAppRoot'].set(zkAppStorage.root);

    //     await treasuryManagerContract.deploy();
    //     treasuryManagerContract['zkAppRoot'].set(zkAppStorage.root);
    //     await treasuryManagerTokenContract.deploy();
    //     fundingContract.approve(treasuryManagerTokenContract.self);

    //     await fundingRequesterContract.deploy();
    //     fundingRequesterContract['zkAppRoot'].set(
    //         zkAppStorageForRequester.root
    //     );
    //     await fundingRequesterTokenContractForCampaign.deploy();
    //     campaignContract.approve(fundingRequesterTokenContractForCampaign.self);
    //     await fundingRequesterTokenContractForFunding.deploy();
    //     fundingContract.approve(fundingRequesterTokenContractForFunding.self);
    // });
    // await tx.prove();
    // await tx
    //     .sign([
    //         deployerKey,
    //         projectContractPrivateKey,
    //         campaignContractPrivateKey,
    //         participationContractPrivateKey,
    //         fundingContractPrivateKey,
    //         treasuryManagerContractPrivateKey,
    //         fundingRequesterContractPrivateKey,
    //     ])
    //     .send();

    // console.log('Project Contract');
    // console.log('Private Key: ', projectContractPrivateKey.toBase58());
    // console.log('Public Key: ', projectContractPublicKey.toBase58());
    // console.log('Campaign Contract');
    // console.log('Private Key: ', campaignContractPrivateKey.toBase58());
    // console.log('Public Key: ', campaignContractPublicKey.toBase58());
    // console.log('Participation Contract');
    // console.log('Private Key: ', participationContractPrivateKey.toBase58());
    // console.log('Public Key: ', participationContractPublicKey.toBase58());
    // console.log('Funding Contract');
    // console.log('Private Key: ', fundingContractPrivateKey.toBase58());
    // console.log('Public Key: ', fundingContractPublicKey.toBase58());
    // console.log('TreasuryManager Contract');
    // console.log('Private Key: ', treasuryManagerContractPrivateKey.toBase58());
    // console.log('Public Key: ', treasuryManagerContractPublicKey.toBase58);
    // console.log('FundingRequester Contract');
    // console.log('Private Key: ', fundingRequesterContractPrivateKey.toBase58());
    // console.log('Public Key: ', fundingRequesterContractPublicKey.toBase58());
}

main();
