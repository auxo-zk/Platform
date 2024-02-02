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
} from 'o1js';

import fs from 'fs/promises';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
    FundingContract,
    CreateReduceProof,
    CreateRollupProof,
    FundingInput,
    FundingAction,
} from '../contracts/Funding.js';
import {
    RequestIdStorage,
    TotalFundStorage,
    ValueStorage,
} from '../contracts/FundingStorage.js';
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
import { TreasuryContract, ClaimFund } from '../contracts/Treasury.js';

describe('Funding', () => {
    const doProofs = false;
    const cache = Cache.FileSystem('./caches');

    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);

    let feePayerKey: Key = Local.testAccounts[0];
    let contracts: ContractList = {};
    let tx: any;
    let fundingContract: FundingContract;
    // Funding storage
    let fundingReduceStorage = new ReduceStorage();
    let sumRStorage = new ValueStorage();
    let sumMStorage = new ValueStorage();
    let requestIdStorage = new RequestIdStorage();
    let totalFundStorage = new TotalFundStorage();
    let fundingAddressStorage = new AddressStorage();
    let fundingAction: FundingAction[] = [];
    let fundingInput: FundingInput[];
    let index: number;
    let fundingActionStates: Field[];
    let secretVectors: CustomScalarArray[] = [
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(10n)),
            CustomScalar.fromScalar(Scalar.from(10n)),
            CustomScalar.fromScalar(Scalar.from(50n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
        ]),
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(10n)),
            CustomScalar.fromScalar(Scalar.from(10n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(10n)),
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

    let investors: Key[] = [
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
                            case Contract.REQUEST:
                                return new ZkApp.Request.RequestContract(
                                    key.publicKey
                                );
                            default:
                                return new SmartContract(key.publicKey);
                        }
                    })();

                    fundingAddressStorage.updateAddress(
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

        fundingContract = contracts[Contract.FUNDING]
            .contract as FundingContract;
    });

    it('compile proof', async () => {
        console.log('CreateReduceProof.compile...');
        await CreateReduceProof.compile();
        console.log('CreateRollupProof.compile...');
        await CreateRollupProof.compile();
        if (doProofs) {
            console.log('FundingContract.compile...');
            await FundingContract.compile();
            await ClaimFund.compile();
            await TreasuryContract.compile();
        } else {
            console.log('FundingContract.analyzeMethods...');
            FundingContract.analyzeMethods();
        }
    });

    it('Deploy and funding', async () => {
        console.log('addresses: ', fundingAddressStorage.addresses);
        await deploy(
            contracts[Contract.FUNDING],
            [['zkApps', fundingAddressStorage.root]],
            feePayerKey
        );
        await deploy(contracts[Contract.TREASURY], [], feePayerKey);
        await deploy(contracts[Contract.REQUEST], [], feePayerKey);

        console.log('Funding...');

        let fundingContract = contracts[Contract.FUNDING]
            .contract as FundingContract;

        fundingInput = [
            new FundingInput({
                campaignId: Field(1),
                committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
                secretVector: secretVectors[0],
                random: randomsVectors[0],
                treasuryContract: fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.TREASURY,
                    contracts[Contract.TREASURY].contract.address
                ),
            }),
            new FundingInput({
                campaignId: Field(1),
                committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
                secretVector: secretVectors[1],
                random: randomsVectors[1],
                treasuryContract: fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.TREASURY,
                    contracts[Contract.TREASURY].contract.address
                ),
            }),
        ];

        let result: {
            R: ZkApp.Request.RequestVector;
            M: ZkApp.Request.RequestVector;
        };

        for (let i = 0; i < investors.length; i++) {
            let balanceBefore = Number(
                Account(investors[i].publicKey).balance.get()
            );
            tx = await Mina.transaction(investors[i].publicKey, () => {
                result = fundingContract.fund(fundingInput[i]);
            });
            await proveAndSend(tx, [investors[i]], Contract.FUNDING, 'fund');
            let balanceAfter = Number(
                Account(investors[i].publicKey).balance.get()
            );
            console.log('Balance change: ', balanceBefore - balanceAfter);

            let { R, M } = result!;

            let dimension = fundingInput[i].secretVector.length;
            let totalMinaInvest = Provable.witness(Field, () => {
                let curSum = 0n;
                for (let j = 0; j < dimension.toBigInt(); j++) {
                    curSum += fundingInput[i].secretVector
                        .get(Field(j))
                        .toScalar()
                        .toBigInt();
                }
                return Field(curSum);
            });

            fundingAction.push(
                new FundingAction({
                    campaignId: fundingInput[i].campaignId,
                    R,
                    M,
                    fundAmount: totalMinaInvest,
                })
            );
        }
    });

    it('Reduce', async () => {
        await fetchAllContract(contracts, [Contract.FUNDING]);

        let fundingContract = contracts[Contract.FUNDING]
            .contract as FundingContract;
        let lastActionState = fundingContract.actionState.get();
        fundingActionStates = contracts[Contract.FUNDING].actionStates;
        index = fundingActionStates.findIndex((obj) =>
            Boolean(obj.equals(lastActionState))
        );
        Provable.log('lastActionStates: ', lastActionState);
        Provable.log('Funding action states: ', fundingActionStates);
        Provable.log('Index: ', index);

        console.log('Reduce funding...');

        console.log('First step: ');
        let reduceFundingProof = await CreateReduceProof.firstStep(
            fundingContract.actionState.get(),
            fundingContract.actionStatus.get()
        );

        console.log('Next step: ');

        for (let i = 0; i < investors.length; i++) {
            console.log('Step', i);
            reduceFundingProof = await CreateReduceProof.nextStep(
                reduceFundingProof,
                fundingAction[i],
                fundingReduceStorage.getWitness(
                    fundingActionStates[index + 1 + i]
                )
            );

            // update storage:
            fundingReduceStorage.updateLeaf(
                fundingReduceStorage.calculateIndex(
                    fundingActionStates[index + 1 + i]
                ),
                fundingReduceStorage.calculateLeaf(ActionStatus.REDUCED)
            );
        }

        tx = await Mina.transaction(feePayerKey.publicKey, () => {
            fundingContract.reduce(reduceFundingProof);
        });
        await proveAndSend(tx, [feePayerKey], Contract.FUNDING, 'reduce');
    });

    it('RollUp', async () => {
        let fundingContract = contracts[Contract.FUNDING]
            .contract as FundingContract;
        console.log('RollUp funding...');

        await fetchAllContract(contracts, [Contract.REQUEST]);

        let rollUpFundingProof = await CreateRollupProof.firstStep(
            fundingAction[0].campaignId,
            secretVectors[0].length,
            fundingContract.actionStatus.get()
        );

        for (let i = 0; i < investors.length; i++) {
            console.log('Step', i);
            rollUpFundingProof = await CreateRollupProof.nextStep(
                rollUpFundingProof,
                fundingAction[i],
                fundingActionStates[index + i],
                fundingReduceStorage.getWitness(
                    fundingActionStates[index + 1 + i]
                )
            );
        }

        tx = await Mina.transaction(feePayerKey.publicKey, () => {
            fundingContract.rollupRequest(
                rollUpFundingProof,
                Field(2),
                Field(2),
                sumRStorage.getLevel1Witness(
                    sumRStorage.calculateLevel1Index(
                        fundingAction[0].campaignId
                    )
                ),
                sumMStorage.getLevel1Witness(
                    sumMStorage.calculateLevel1Index(
                        fundingAction[0].campaignId
                    )
                ),
                requestIdStorage.getLevel1Witness(
                    requestIdStorage.calculateLevel1Index(
                        fundingAction[0].campaignId
                    )
                ),
                totalFundStorage.getLevel1Witness(
                    requestIdStorage.calculateLevel1Index(
                        fundingAction[0].campaignId
                    )
                ),
                fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.REQUEST,
                    contracts[Contract.REQUEST].contract.address
                )
            );
        });
        await proveAndSend(tx, [feePayerKey], Contract.FUNDING, '');
    });
});
