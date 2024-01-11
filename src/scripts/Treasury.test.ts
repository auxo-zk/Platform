// import {
//   Field,
//   Reducer,
//   Mina,
//   PrivateKey,
//   PublicKey,
//   AccountUpdate,
//   Poseidon,
//   MerkleMap,
//   MerkleTree,
//   MerkleWitness,
//   Proof,
//   Void,
//   Cache,
//   SmartContract,
//   Scalar,
//   Account,
//   Provable,
// } from 'o1js';

// import fs from 'fs/promises';
// import { getProfiler } from './helper/profiler.js';
// import randomAccounts from './helper/randomAccounts.js';
// import {
//   FundingContract,
//   CreateReduceProof,
//   CreateRollupProof,
//   FundingInput,
// } from '../contracts/Funding.js';
// import { ValueStorage } from '../contracts/FundingStorage.js';
// import { Key, Config } from './helper/config.js';
// import {
//   AddressStorage,
//   EMPTY_ADDRESS_MT,
//   ReduceStorage,
//   getZkAppRef,
//   ActionStatus,
// } from '../contracts/SharedStorage.js';
// import { Contract, ZkAppEnum } from '../constants.js';
// import {
//   ContractList,
//   deploy,
//   proveAndSend,
//   fetchAllContract,
// } from '../libs/utils.js';
// import { CustomScalar } from '@auxo-dev/auxo-libs';
// import { CustomScalarArray, ZkApp } from '@auxo-dev/dkg';
// import {
//   TreasuryContract,
//   ClaimFund,
//   TreasuryAction,
//   ClaimFundInput,
// } from '../contracts/Treasury.js';
// import { ClaimedStorage } from '../contracts/TreasuryStorage.js';
// import { ParticipationContract } from '../contracts/Participation.js';

// describe('Funding', () => {
//   const doProofs = false;
//   const cache = Cache.FileSystem('./caches');

//   let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
//   Mina.setActiveInstance(Local);

//   let feePayerKey: Key = Local.testAccounts[0];
//   let contracts: ContractList = {};
//   let addressMerkleTree = EMPTY_ADDRESS_MT();
//   let tx;
//   // Funding storage
//   let claimedStorage = new ClaimedStorage();
//   let allAddressStorage = new AddressStorage(addressMerkleTree);
//   let treasuryAction: ClaimedStorage[] = [];
//   let claimFundInput: ClaimFundInput[];
//   let fundingInput: FundingInput[];
//   let index: number;
//   let treasuryActionStates: Field[];
//   let sumD: CustomScalarArray[] = [
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(50n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//     ]),
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//     ]),
//   ];
//   let secretVectors: CustomScalarArray[] = [
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(50n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//     ]),
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//       CustomScalar.fromScalar(Scalar.from(10n)),
//     ]),
//   ];

//   let randomsVectors: CustomScalarArray[] = [
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(100n)),
//       CustomScalar.fromScalar(Scalar.from(200n)),
//       CustomScalar.fromScalar(Scalar.from(300n)),
//       CustomScalar.fromScalar(Scalar.from(400n)),
//     ]),
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(500n)),
//       CustomScalar.fromScalar(Scalar.from(600n)),
//       CustomScalar.fromScalar(Scalar.from(700n)),
//       CustomScalar.fromScalar(Scalar.from(800n)),
//     ]),
//   ];

//   let projects: Key[] = [
//     {
//       privateKey: Local.testAccounts[1].privateKey,
//       publicKey: Local.testAccounts[1].publicKey,
//     },
//     {
//       privateKey: Local.testAccounts[2].privateKey,
//       publicKey: Local.testAccounts[2].publicKey,
//     },
//   ];

//   beforeAll(async () => {
//     let configJson: Config = JSON.parse(
//       await fs.readFile('config.json', 'utf8')
//     );
//     await Promise.all(
//       Object.keys(Contract)
//         .filter((item) => isNaN(Number(item)))
//         .map(async (e) => {
//           let config = configJson.deployAliases[e.toLowerCase()];
//           // console.log(config);
//           let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
//             await fs.readFile(config.keyPath, 'utf8')
//           );
//           let key = {
//             privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
//             publicKey: PublicKey.fromBase58(keyBase58.publicKey),
//           };
//           let contract = (() => {
//             switch (e.toLowerCase()) {
//               case Contract.FUNDING:
//                 return new FundingContract(key.publicKey);
//               case Contract.TREASURY:
//                 return new TreasuryContract(key.publicKey);
//               case Contract.PARTICIPATION:
//                 return new ParticipationContract(key.publicKey);
//               case Contract.REQUEST:
//                 return new ZkApp.Request.RequestContract(key.publicKey);
//               default:
//                 return new SmartContract(key.publicKey);
//             }
//           })();

//           addressMerkleTree.setLeaf(
//             AddressStorage.calculateIndex(ZkAppEnum[e]).toBigInt(),
//             AddressStorage.calculateLeaf(key.publicKey)
//           );

//           contracts[e.toLowerCase()] = {
//             name: e.toLowerCase(),
//             key: key,
//             contract: contract,
//             actionStates: [Reducer.initialActionState],
//           };
//         })
//     );

//     allAddressStorage = new AddressStorage(addressMerkleTree);
//   });

//   // beforeEach(() => {});

//   it('compile proof', async () => {
//     console.log('ClaimFund.compile...');
//     await ClaimFund.compile();
//     if (doProofs) {
//       console.log('TreasuryContract.compile...');
//       await TreasuryContract.compile();
//     } else {
//       console.log('FundingContract.analyzeMethods...');
//       TreasuryContract.analyzeMethods();
//     }
//   });

//   it('Deploy and funding', async () => {
//     await deploy(
//       contracts[Contract.TREASURY],
//       [['zkApps', allAddressStorage.addresses.getRoot()]],
//       feePayerKey
//     );

//     tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
//       feePayerAccount.send({
//         to: contracts[Contract.FUNDING].contract,
//         amount: 100 * 10 ** 9,
//       }); // 100 Mina to claim fund
//     });
//     await tx.sign([feePayerKey.privateKey]).send();

//     console.log('Claim Fund...');

//     let treasuryContract = contracts[Contract.TREASURY]
//       .contract as TreasuryContract;

//     fundingInput = [
//       new FundingInput({
//         campaignId: Field(1),
//         committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
//         secretVector: secretVectors[0],
//         random: randomsVectors[0],
//         treasuryContract: getZkAppRef(
//           allAddressStorage.addresses,
//           ZkAppEnum.TREASURY,
//           contracts[Contract.TREASURY].contract.address
//         ),
//       }),
//       new FundingInput({
//         campaignId: Field(1),
//         committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
//         secretVector: secretVectors[1],
//         random: randomsVectors[1],
//         treasuryContract: getZkAppRef(
//           allAddressStorage.addresses,
//           ZkAppEnum.TREASURY,
//           contracts[Contract.TREASURY].contract.address
//         ),
//       }),
//     ];

//     claimFundInput = [
//       new ClaimFundInput({
//         campaignId: Field(1),
//         projectId: Field(1),
//         committeeId: Field(1),
//         keyId: Field(1),
//         payeeAddress: projects[0].publicKey,
//         R: ZkApp.Request.RequestVector,
//         M: ZkApp.Request.RequestVector,
//         D: ZkApp.Request.RequestVector,
//         DWitness: MerkleMapWitness,
//         investVector: InvestVector,
//         participationIndex: Field,
//         indexWitness: indexWitness,
//         claimedIndex: Level1CWitness,
//         participationRef: getZkAppRef(
//           allAddressStorage.addresses,
//           ZkAppEnum.PARTICIPATION,
//           contracts[Contract.PARTICIPATION].contract.address
//         ),
//       }),
//       new ClaimFundInput({
//         campaignId: Field(1),
//         committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
//         secretVector: secretVectors[1],
//         random: randomsVectors[1],
//         treasuryContract: getZkAppRef(
//           allAddressStorage.addresses,
//           ZkAppEnum.TREASURY,
//           contracts[Contract.TREASURY].contract.address
//         ),
//       }),
//     ];

//     let result: {
//       R: ZkApp.Request.RequestVector;
//       M: ZkApp.Request.RequestVector;
//     };

//     for (let i = 0; i < investors.length; i++) {
//       let balanceBefore = Number(Account(investors[i].publicKey).balance.get());
//       tx = await Mina.transaction(investors[i].publicKey, () => {
//         result = treasuryContract.fund(claimFundInput[i]);
//       });
//       await proveAndSend(tx, [investors[i]], Contract.FUNDING, 'fund');
//       let balanceAfter = Number(Account(investors[i].publicKey).balance.get());
//       console.log('Balance change: ', balanceBefore - balanceAfter);

//       let { R, M } = result!;

//       treasuryAction.push(
//         new TreasuryAction({
//           campaignId: claimFundInput[i].campaignId,
//           R,
//           M,
//         })
//       );
//     }
//   });

//   it('Reduce', async () => {
//     await fetchAllContract(contracts, [Contract.FUNDING]);

//     let treasuryContract = contracts[Contract.FUNDING]
//       .contract as FundingContract;
//     let lastActionState = treasuryContract.actionState.get();
//     treasuryActionStates = contracts[Contract.FUNDING].actionStates;
//     index = treasuryActionStates.findIndex((obj) =>
//       Boolean(obj.equals(lastActionState))
//     );
//     Provable.log('lastActionStates: ', lastActionState);
//     Provable.log('Funding action states: ', treasuryActionStates);
//     Provable.log('Index: ', index);

//     console.log('Reduce funding...');

//     console.log('First step: ');
//     let reduceFundingProof = await CreateReduceProof.firstStep(
//       treasuryContract.actionState.get(),
//       treasuryContract.actionStatus.get()
//     );

//     console.log('Next step: ');

//     for (let i = 0; i < investors.length; i++) {
//       console.log('Step', i);
//       reduceFundingProof = await CreateReduceProof.nextStep(
//         reduceFundingProof,
//         treasuryAction[i],
//         fundingReduceStorage.getWitness(treasuryActionStates[index + 1 + i])
//       );

//       // update storage:
//       fundingReduceStorage.updateLeaf(
//         fundingReduceStorage.calculateIndex(
//           treasuryActionStates[index + 1 + i]
//         ),
//         fundingReduceStorage.calculateLeaf(ActionStatus.REDUCED)
//       );
//     }

//     tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       treasuryContract.reduce(reduceFundingProof);
//     });
//     await proveAndSend(tx, [feePayerKey], Contract.FUNDING, 'reduce');
//   });

//   it('RollUp', async () => {
//     let treasuryContract = contracts[Contract.FUNDING]
//       .contract as FundingContract;
//     console.log('RollUp funding...');

//     await fetchAllContract(contracts, [Contract.REQUEST]);

//     let rollUpFundingProof = await CreateRollupProof.firstStep(
//       treasuryAction[0].campaignId,
//       secretVectors[0].length,
//       treasuryContract.actionStatus.get()
//     );

//     for (let i = 0; i < investors.length; i++) {
//       console.log('Step', i);
//       rollUpFundingProof = await CreateRollupProof.nextStep(
//         rollUpFundingProof,
//         treasuryAction[i],
//         treasuryActionStates[index + i],
//         fundingReduceStorage.getWitness(treasuryActionStates[index + 1 + i])
//       );

//       // update storage:
//       fundingReduceStorage.updateLeaf(
//         fundingReduceStorage.calculateIndex(
//           treasuryActionStates[index + 1 + i]
//         ),
//         fundingReduceStorage.calculateLeaf(ActionStatus.ROLL_UPED)
//       );
//     }

//     tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       treasuryContract.rollupRequest(
//         rollUpFundingProof,
//         Field(2),
//         Field(2),
//         sumRStorage.getLevel1Witness(
//           sumRStorage.calculateLevel1Index(treasuryAction[0].campaignId)
//         ),
//         sumMStorage.getLevel1Witness(
//           sumMStorage.calculateLevel1Index(treasuryAction[0].campaignId)
//         ),
//         getZkAppRef(
//           allAddressStorage.addresses,
//           ZkAppEnum.REQUEST,
//           contracts[Contract.REQUEST].contract.address
//         )
//       );
//     });
//     await proveAndSend(tx, [feePayerKey], Contract.FUNDING, '');
//   });
// });
