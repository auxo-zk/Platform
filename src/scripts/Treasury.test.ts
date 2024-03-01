import {
    Field,
    Reducer,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Poseidon,
    MerkleMap,
    MerkleTree,
    MerkleWitness,
    Proof,
    Void,
    Cache,
    SmartContract,
    Scalar,
    Account,
    Provable,
    Group,
    Bool,
} from 'o1js';

import fs from 'fs/promises';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
    FundingContract,
    CreateReduceProof,
    CreateRollupProof,
    FundingInput,
} from '../contracts/Funding.js';
import { ValueStorage } from '../contracts/FundingStorage.js';
import { Key, Config } from './helper/config.js';
import {
    AddressStorage,
    EMPTY_ADDRESS_MT,
    ReduceStorage,
    getZkAppRef,
    ActionStatus,
} from '../contracts/SharedStorage.js';
import { Contract, ZkAppEnum } from '../constants.js';
import {
    ContractList,
    deploy,
    proveAndSend,
    fetchAllContract,
} from '../libs/utils.js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import { CustomScalarArray, ZkApp } from '@auxo-dev/dkg';
import {
    TreasuryContract,
    ClaimFund,
    TreasuryAction,
    ClaimFundInput,
    InvestVector,
} from '../contracts/Treasury.js';
import { ClaimedStorage } from '../contracts/TreasuryStorage.js';
import { ParticipationContract } from '../contracts/Participation.js';
import {
    Level1CWitness as IndexWitness,
    IndexStorage,
} from '../contracts/ParticipationStorage.js';
import { StatusStorage } from '../contracts/CampaignStorage.js';

describe('Funding', () => {
    const doProofs = true;
    const cache = Cache.FileSystem('./caches');

    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);

    let feePayerKey: Key = Local.testAccounts[0];
    let contracts: ContractList = {};
    let tx;
    // contract storage
    let claimedStorage = new ClaimedStorage();
    let participantIndexStorage = new IndexStorage();
    let allAddressStorage = new AddressStorage();
    let statusStorage = new StatusStorage();

    let treasuryAction: TreasuryAction[] = [];
    let claimFundInput: ClaimFundInput[];
    let index: number;
    let treasuryActionStates: Field[];
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

    // contract request storage:
    let DStorage = new MerkleMap();

    // earn 0.01
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

    let projects: Key[] = [
        {
            privateKey: Local.testAccounts[1].privateKey,
            publicKey: Local.testAccounts[1].publicKey,
        },
        {
            privateKey: Local.testAccounts[2].privateKey,
            publicKey: Local.testAccounts[2].publicKey,
        },
    ];

    beforeAll(async () => {
        let configJson: Config = JSON.parse(
            await fs.readFile('config.json', 'utf8')
        );
        await Promise.all(
            Object.keys(Contract)
                .filter((item) => isNaN(Number(item)))
                .map(async (e) => {
                    let config = configJson.deployAliases[e.toLowerCase()];
                    // console.log(config);
                    let keyBase58: { privateKey: string; publicKey: string } =
                        JSON.parse(await fs.readFile(config.keyPath, 'utf8'));
                    let key = {
                        privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
                        publicKey: PublicKey.fromBase58(keyBase58.publicKey),
                    };
                    let contract = (() => {
                        switch (e.toLowerCase()) {
                            case Contract.FUNDING:
                                return new FundingContract(key.publicKey);
                            case Contract.TREASURY:
                                return new TreasuryContract(key.publicKey);
                            case Contract.PARTICIPATION:
                                return new ParticipationContract(key.publicKey);
                            case Contract.REQUEST:
                                return new ZkApp.Request.RequestContract(
                                    key.publicKey
                                );
                            default:
                                return new SmartContract(key.publicKey);
                        }
                    })();

                    allAddressStorage.updateAddress(
                        AddressStorage.calculateIndex(ZkAppEnum[e]),
                        key.publicKey
                    );

                    contracts[e.toLowerCase()] = {
                        name: e.toLowerCase(),
                        key: key,
                        contract: contract,
                        actionStates: [Reducer.initialActionState],
                    };
                })
        );
    });

    // beforeEach(() => {});

    it('compile proof', async () => {
        console.log('ClaimFund.compile...');
        await ClaimFund.compile();
        if (doProofs) {
            console.log('TreasuryContract.compile...');
            await TreasuryContract.compile();
        } else {
            console.log('FundingContract.analyzeMethods...');
            TreasuryContract.analyzeMethods();
        }
    });

    it('Deploy and funding', async () => {
        let treasuryContract = contracts[Contract.TREASURY]
            .contract as TreasuryContract;

        tx = await Mina.transaction(feePayerKey.publicKey, () => {
            let feePayerAccount = AccountUpdate.fundNewAccount(
                feePayerKey.publicKey,
                1
            );
            treasuryContract.deploy();
            treasuryContract.zkApps.set(allAddressStorage.root);
            feePayerAccount.send({
                to: contracts[Contract.TREASURY].contract,
                amount: 5 * 10 ** 9,
            });
        });
        await tx.prove();
        await tx
            .sign([
                feePayerKey.privateKey,
                contracts[Contract.TREASURY].key.privateKey,
            ])
            .send();

        console.log('Claim Fund...');

        claimFundInput = [
            new ClaimFundInput({
                campaignId: Field(1),
                projectId: Field(1),
                requestId: Field(6969),
                payeeAccount: projects[0].publicKey,
                M: sumM,
                D: sumD,
                DWitness: DStorage.getWitness(Field(6969)),
                investVector: investVectors,
                participationIndexWitness:
                    participantIndexStorage.getLevel1Witness(
                        participantIndexStorage.calculateLevel1Index({
                            campaignId: Field(1),
                            projectId: Field(1),
                        })
                    ),
                claimedIndex: claimedStorage.getLevel1Witness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: Field(1),
                        projectId: Field(1),
                    })
                ),
                campaignStatusWitness: statusStorage.getLevel1Witness(
                    statusStorage.calculateLevel1Index(Field(1))
                ),
                participationRef: allAddressStorage.getZkAppRef(
                    ZkAppEnum.PARTICIPATION,
                    contracts[Contract.PARTICIPATION].contract.address
                ),
                campaignRef: allAddressStorage.getZkAppRef(
                    ZkAppEnum.CAMPAIGN,
                    contracts[Contract.CAMPAIGN].contract.address
                ),
            }),
            new ClaimFundInput({
                campaignId: Field(1),
                projectId: Field(2),
                requestId: Field(6969),
                payeeAccount: projects[1].publicKey,
                M: sumM,
                D: sumD,
                DWitness: DStorage.getWitness(Field(6969)),
                investVector: investVectors,
                participationIndexWitness:
                    participantIndexStorage.getLevel1Witness(
                        participantIndexStorage.calculateLevel1Index({
                            campaignId: Field(1),
                            projectId: Field(2),
                        })
                    ),
                claimedIndex: claimedStorage.getLevel1Witness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: Field(1),
                        projectId: Field(2),
                    })
                ),
                campaignStatusWitness: statusStorage.getLevel1Witness(
                    statusStorage.calculateLevel1Index(Field(1))
                ),
                participationRef: allAddressStorage.getZkAppRef(
                    ZkAppEnum.PARTICIPATION,
                    contracts[Contract.PARTICIPATION].contract.address
                ),
                campaignRef: allAddressStorage.getZkAppRef(
                    ZkAppEnum.CAMPAIGN,
                    contracts[Contract.CAMPAIGN].contract.address
                ),
            }),
        ];

        for (let i = 0; i < projects.length; i++) {
            let balanceBefore = Number(
                Account(projects[i].publicKey).balance.get()
            );
            tx = await Mina.transaction(projects[i].publicKey, () => {
                treasuryContract.claimFund(claimFundInput[i]);
            });
            await proveAndSend(tx, [projects[i]], Contract.FUNDING, 'fund');
            let balanceAfter = Number(
                Account(projects[i].publicKey).balance.get()
            );
            console.log('Balance change: ', balanceBefore - balanceAfter);

            treasuryAction.push(
                new TreasuryAction({
                    campaignId: claimFundInput[i].campaignId,
                    projectId: claimFundInput[i].projectId,
                })
            );
        }
    });

    it('Reduce Treasury', async () => {
        await fetchAllContract(contracts, [Contract.TREASURY]);

        let treasuryContract = contracts[Contract.TREASURY]
            .contract as TreasuryContract;
        let lastActionState = treasuryContract.lastRolledUpActionState.get();
        treasuryActionStates = contracts[Contract.TREASURY].actionStates;
        index = treasuryActionStates.findIndex((obj) =>
            Boolean(obj.equals(lastActionState))
        );

        console.log('First step: ');
        let reduceFundingProof = await ClaimFund.firstStep(
            treasuryContract.claimedTreeRoot.get(),
            treasuryContract.lastRolledUpActionState.get()
        );

        console.log('Next step: ');

        for (let i = 0; i < projects.length; i++) {
            console.log('Step', i);
            reduceFundingProof = await ClaimFund.nextStep(
                reduceFundingProof,
                treasuryAction[i],
                claimedStorage.getWitness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: treasuryAction[i].campaignId,
                        projectId: treasuryAction[i].projectId,
                    })
                )
            );

            // update storage:
            claimedStorage.updateLeaf(
                claimedStorage.calculateLevel1Index({
                    campaignId: treasuryAction[i].campaignId,
                    projectId: treasuryAction[i].projectId,
                }),
                claimedStorage.calculateLeaf(Bool(true))
            );
        }

        tx = await Mina.transaction(feePayerKey.publicKey, () => {
            treasuryContract.rollup(reduceFundingProof);
        });
        await proveAndSend(tx, [feePayerKey], Contract.TREASURY, 'rollup');
    });
});
