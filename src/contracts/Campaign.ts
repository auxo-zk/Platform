import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Reducer,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    ZkProgram,
    PublicKey,
    Void,
    Bool,
} from 'o1js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import {
    EMPTY_LEVEL_1_TREE,
    Level1Witness,
    StatusEnum,
    ActionEnum,
    ConfigStorage,
    OwnerStorage,
    InfoStorage,
} from './CampaignStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class CampaignAction extends Struct({
    actionType: Field,
    campaignId: Field,
    ipfsHash: IPFSHash,
    owner: PublicKey,
    campaignStatus: Field,
    committeeId: Field,
    keyId: Field,
}) {
    static fromFields(fields: Field[]): CampaignAction {
        return super.fromFields(fields) as CampaignAction;
    }
}

export class CheckCampaignOwnerInput extends Struct({
    owner: PublicKey,
    campaignId: Field,
    ownerWitness: Level1Witness,
}) {}

export class CheckCampaignStatusInput extends Struct({
    campaignId: Field,
    currentStatus: Field,
    statusWitness: Level1Witness,
}) {}

export class CreateCampaignInput extends Struct({
    ipfsHash: IPFSHash,
    committeeId: Field,
    keyId: Field,
}) {
    static fromFields(fields: Field[]): CreateCampaignInput {
        return super.fromFields(fields) as CreateCampaignInput;
    }
}

export class UpdateCampaignInfo extends Struct({
    campaignId: Field,
    ipfsHash: IPFSHash,
    ownerWitness: Level1Witness,
}) {
    static fromFields(fields: Field[]): UpdateCampaignInfo {
        return super.fromFields(fields) as UpdateCampaignInfo;
    }
}

export class UpdateCampaignStatus extends Struct({
    campaignId: Field,
    campaignStatus: Field,
    ownerWitness: Level1Witness,
}) {
    static fromFields(fields: Field[]): UpdateCampaignStatus {
        return super.fromFields(fields) as UpdateCampaignStatus;
    }
}

export class UpdateCampaignConfig extends Struct({
    campaignId: Field,
    committeeId: Field,
    keyId: Field,
    ownerWitness: Level1Witness,
}) {
    static fromFields(fields: Field[]): UpdateCampaignConfig {
        return super.fromFields(fields) as UpdateCampaignConfig;
    }
}

export class CreateCampaignProofOutput extends Struct({
    initialOwnerTreeRoot: Field,
    initialInfoTreeRoot: Field,
    initialStatusTreeRoot: Field,
    initialConfigTreeRoot: Field,
    initialNextCampaignId: Field,
    initialLastRolledUpACtionState: Field,
    finalOwnerTreeRoot: Field,
    finalInfoTreeRoot: Field,
    finalStatusTreeRoot: Field,
    finalConfigTreeRoot: Field,
    finalNextCampaignId: Field,
    finalLastRolledUpActionState: Field,
}) {
    hash(): Field {
        return Poseidon.hash(CreateCampaignProofOutput.toFields(this));
    }
}

export const CreateCampaign = ZkProgram({
    name: 'create-campaign',
    publicOutput: CreateCampaignProofOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field, Field, Field],
            method(
                initialOwnerTreeRoot,
                initialInfoTreeRoot,
                initialStatusTreeRoot,
                initialConfigTreeRoot,
                initialNextCampaignId,
                initialLastRolledUpACtionState
            ): CreateCampaignProofOutput {
                return new CreateCampaignProofOutput({
                    initialOwnerTreeRoot,
                    initialInfoTreeRoot,
                    initialStatusTreeRoot,
                    initialConfigTreeRoot,
                    initialNextCampaignId,
                    initialLastRolledUpACtionState,
                    finalOwnerTreeRoot: initialOwnerTreeRoot,
                    finalInfoTreeRoot: initialInfoTreeRoot,
                    finalStatusTreeRoot: initialStatusTreeRoot,
                    finalConfigTreeRoot: initialConfigTreeRoot,
                    finalNextCampaignId: initialNextCampaignId,
                    finalLastRolledUpActionState:
                        initialLastRolledUpACtionState,
                });
            },
        },
        createCampaign: {
            privateInputs: [
                SelfProof<Void, CreateCampaignProofOutput>,
                CampaignAction,
                Level1Witness,
                Level1Witness,
                Level1Witness,
                Level1Witness,
            ],
            method(
                preProof: SelfProof<Void, CreateCampaignProofOutput>,
                newAction: CampaignAction,
                ownerWitness: Level1Witness,
                infoWitness: Level1Witness,
                statusWitness: Level1Witness,
                configWitness: Level1Witness
            ): CreateCampaignProofOutput {
                preProof.verify();

                // check if this action is create campaign
                newAction.actionType.assertEquals(
                    Field(ActionEnum.CREATE_CAMPAIGN)
                );

                let newCampaignId = preProof.publicOutput.finalNextCampaignId;

                ////// calculate new ownerTreeRoot
                let preOwnerRoot = ownerWitness.calculateRoot(Field(0));
                let ownerIndex = ownerWitness.calculateIndex();
                ownerIndex.assertEquals(newCampaignId);
                preOwnerRoot.assertEquals(
                    preProof.publicOutput.finalOwnerTreeRoot
                );

                // update ownerTreeRoot
                let newOwnerTreeRoot = ownerWitness.calculateRoot(
                    OwnerStorage.calculateLeaf(newAction.owner)
                );

                ////// calculate in infoTreeRoot
                let preInfoRoot = infoWitness.calculateRoot(Field(0));
                let infoIndex = infoWitness.calculateIndex();
                infoIndex.assertEquals(newCampaignId);
                preInfoRoot.assertEquals(
                    preProof.publicOutput.finalInfoTreeRoot
                );

                // update infoTreeRoot
                let newInfoTreeRoot = infoWitness.calculateRoot(
                    InfoStorage.calculateLeaf(newAction.ipfsHash)
                );

                ////// calculate in statusTreeRoot
                let preStatusRoot = statusWitness.calculateRoot(Field(0));
                let statusIndex = statusWitness.calculateIndex();
                statusIndex.assertEquals(newCampaignId);
                preStatusRoot.assertEquals(
                    preProof.publicOutput.finalStatusTreeRoot
                );

                // update statusTreeRoot
                let newStatusTreeRoot = statusWitness.calculateRoot(
                    newAction.campaignStatus
                );

                ////// calculate in configTreeRoot
                let preConfigRoot = configWitness.calculateRoot(Field(0));
                let configIndex = configWitness.calculateIndex();
                configIndex.assertEquals(newCampaignId);
                preConfigRoot.assertEquals(
                    preProof.publicOutput.finalConfigTreeRoot
                );

                // update configTreeRoot
                let newConfigTreeRoot = configWitness.calculateRoot(
                    ConfigStorage.calculateLeaf({
                        committeeId: newAction.committeeId,
                        keyId: newAction.keyId,
                    })
                );

                return new CreateCampaignProofOutput({
                    initialOwnerTreeRoot:
                        preProof.publicOutput.initialOwnerTreeRoot,
                    initialInfoTreeRoot:
                        preProof.publicOutput.initialInfoTreeRoot,
                    initialStatusTreeRoot:
                        preProof.publicOutput.initialStatusTreeRoot,
                    initialConfigTreeRoot:
                        preProof.publicOutput.initialConfigTreeRoot,
                    initialNextCampaignId:
                        preProof.publicOutput.initialNextCampaignId,
                    initialLastRolledUpACtionState:
                        preProof.publicOutput.initialLastRolledUpACtionState,
                    finalOwnerTreeRoot: newOwnerTreeRoot,
                    finalInfoTreeRoot: newInfoTreeRoot,
                    finalStatusTreeRoot: newStatusTreeRoot,
                    finalConfigTreeRoot: newConfigTreeRoot,
                    finalNextCampaignId:
                        preProof.publicOutput.finalNextCampaignId.add(Field(1)),
                    finalLastRolledUpActionState: updateOutOfSnark(
                        preProof.publicOutput.finalLastRolledUpActionState,
                        [CampaignAction.toFields(newAction)]
                    ),
                });
            },
        },
        updateCampaignStatus: {
            privateInputs: [
                SelfProof<Void, CreateCampaignProofOutput>,
                CampaignAction,
                Field,
                Level1Witness,
            ],
            method(
                preProof: SelfProof<Void, CreateCampaignProofOutput>,
                newAction: CampaignAction,
                currentStatus: Field,
                statusWitness: Level1Witness
            ): CreateCampaignProofOutput {
                preProof.verify();

                // check if this action is create campaign
                newAction.actionType.assertEquals(
                    Field(ActionEnum.UPDATE_STATUS)
                );

                let campaignId = newAction.campaignId;

                ////// calculate in statusTreeRoot
                let preStatusRoot = statusWitness.calculateRoot(currentStatus);
                let statusIndex = statusWitness.calculateIndex();
                statusIndex.assertEquals(campaignId);
                preStatusRoot.assertEquals(
                    preProof.publicOutput.finalStatusTreeRoot
                );

                // update statusTreeRoot
                let newStatusTreeRoot = statusWitness.calculateRoot(
                    newAction.campaignStatus
                );

                return new CreateCampaignProofOutput({
                    initialOwnerTreeRoot:
                        preProof.publicOutput.initialOwnerTreeRoot,
                    initialInfoTreeRoot:
                        preProof.publicOutput.initialInfoTreeRoot,
                    initialStatusTreeRoot:
                        preProof.publicOutput.initialStatusTreeRoot,
                    initialConfigTreeRoot:
                        preProof.publicOutput.initialConfigTreeRoot,
                    initialNextCampaignId:
                        preProof.publicOutput.initialNextCampaignId,
                    initialLastRolledUpACtionState:
                        preProof.publicOutput.initialLastRolledUpACtionState,
                    finalOwnerTreeRoot:
                        preProof.publicOutput.finalOwnerTreeRoot,
                    finalInfoTreeRoot: preProof.publicOutput.finalInfoTreeRoot,
                    finalStatusTreeRoot: newStatusTreeRoot,
                    finalConfigTreeRoot:
                        preProof.publicOutput.finalConfigTreeRoot,
                    finalNextCampaignId:
                        preProof.publicOutput.finalNextCampaignId,
                    finalLastRolledUpActionState: updateOutOfSnark(
                        preProof.publicOutput.finalLastRolledUpActionState,
                        [CampaignAction.toFields(newAction)]
                    ),
                });
            },
        },
        updateCampaignInfo: {
            privateInputs: [
                SelfProof<Void, CreateCampaignProofOutput>,
                CampaignAction,
                IPFSHash,
                Level1Witness,
            ],
            method(
                preProof: SelfProof<Void, CreateCampaignProofOutput>,
                newAction: CampaignAction,
                currentInfo: IPFSHash,
                infoWitness: Level1Witness
            ): CreateCampaignProofOutput {
                preProof.verify();

                // check if this action is create campaign
                newAction.actionType.assertEquals(
                    Field(ActionEnum.UPDATE_INFO)
                );

                let campaignId = newAction.campaignId;

                ////// calculate in infoTreeRoot
                let preInfoRoot = infoWitness.calculateRoot(
                    InfoStorage.calculateLeaf(currentInfo)
                );
                let infoIndex = infoWitness.calculateIndex();
                infoIndex.assertEquals(campaignId);
                preInfoRoot.assertEquals(
                    preProof.publicOutput.finalInfoTreeRoot
                );

                // update infoTreeRoot
                let newInfoTreeRoot = infoWitness.calculateRoot(
                    InfoStorage.calculateLeaf(newAction.ipfsHash)
                );

                return new CreateCampaignProofOutput({
                    initialOwnerTreeRoot:
                        preProof.publicOutput.initialOwnerTreeRoot,
                    initialInfoTreeRoot:
                        preProof.publicOutput.initialInfoTreeRoot,
                    initialStatusTreeRoot:
                        preProof.publicOutput.initialStatusTreeRoot,
                    initialConfigTreeRoot:
                        preProof.publicOutput.initialConfigTreeRoot,
                    initialNextCampaignId:
                        preProof.publicOutput.initialNextCampaignId,
                    initialLastRolledUpACtionState:
                        preProof.publicOutput.initialLastRolledUpACtionState,
                    finalOwnerTreeRoot:
                        preProof.publicOutput.finalOwnerTreeRoot,
                    finalInfoTreeRoot: newInfoTreeRoot,
                    finalStatusTreeRoot:
                        preProof.publicOutput.finalStatusTreeRoot,
                    finalConfigTreeRoot:
                        preProof.publicOutput.finalConfigTreeRoot,
                    finalNextCampaignId:
                        preProof.publicOutput.finalNextCampaignId,
                    finalLastRolledUpActionState: updateOutOfSnark(
                        preProof.publicOutput.finalLastRolledUpActionState,
                        [CampaignAction.toFields(newAction)]
                    ),
                });
            },
        },
        updateCampaignConfig: {
            privateInputs: [
                SelfProof<Void, CreateCampaignProofOutput>,
                CampaignAction,
                Field,
                Field,
                Level1Witness,
            ],
            method(
                preProof: SelfProof<Void, CreateCampaignProofOutput>,
                newAction: CampaignAction,
                currentCommitteeId: Field,
                currentKeyId: Field,
                configWitness: Level1Witness
            ): CreateCampaignProofOutput {
                preProof.verify();

                // check if this action is create campaign
                newAction.actionType.assertEquals(
                    Field(ActionEnum.UPDATE_INFO)
                );

                let campaignId = newAction.campaignId;

                ////// calculate in configTreeRoot
                let preConfigRoot = configWitness.calculateRoot(
                    ConfigStorage.calculateLeaf({
                        committeeId: currentCommitteeId,
                        keyId: currentKeyId,
                    })
                );
                let configIndex = configWitness.calculateIndex();
                configIndex.assertEquals(campaignId);
                preConfigRoot.assertEquals(
                    preProof.publicOutput.finalInfoTreeRoot
                );

                // update configTreeRoot
                let newConfigTreeRoot = configWitness.calculateRoot(
                    ConfigStorage.calculateLeaf({
                        committeeId: newAction.committeeId,
                        keyId: newAction.keyId,
                    })
                );

                return new CreateCampaignProofOutput({
                    initialOwnerTreeRoot:
                        preProof.publicOutput.initialOwnerTreeRoot,
                    initialInfoTreeRoot:
                        preProof.publicOutput.initialInfoTreeRoot,
                    initialStatusTreeRoot:
                        preProof.publicOutput.initialStatusTreeRoot,
                    initialConfigTreeRoot:
                        preProof.publicOutput.initialConfigTreeRoot,
                    initialNextCampaignId:
                        preProof.publicOutput.initialNextCampaignId,
                    initialLastRolledUpACtionState:
                        preProof.publicOutput.initialLastRolledUpACtionState,
                    finalOwnerTreeRoot:
                        preProof.publicOutput.finalOwnerTreeRoot,
                    finalInfoTreeRoot: preProof.publicOutput.finalInfoTreeRoot,
                    finalStatusTreeRoot:
                        preProof.publicOutput.finalStatusTreeRoot,
                    finalConfigTreeRoot: newConfigTreeRoot,
                    finalNextCampaignId:
                        preProof.publicOutput.finalNextCampaignId,
                    finalLastRolledUpActionState: updateOutOfSnark(
                        preProof.publicOutput.finalLastRolledUpActionState,
                        [CampaignAction.toFields(newAction)]
                    ),
                });
            },
        },
    },
});

export class CampaignProof extends ZkProgram.Proof(CreateCampaign) {}

export enum EventEnum {
    CAMPAIGN_CREATED = 'campaign-created',
}

export class CampaignContract extends SmartContract {
    // store owner of campaign
    @state(Field) ownerTreeRoot = State<Field>();
    // store IPFS hash of campaign
    @state(Field) infoTreeRoot = State<Field>();
    // status of the campaign, check enum Status
    @state(Field) statusTreeRoot = State<Field>();
    // hash(committeeId, keyId)
    @state(Field) configTreeRoot = State<Field>();
    // store hash application timeLine
    @state(Field) applicationTimLine = State<Field>();
    // store hash funding timeLine
    @state(Field) fundingTimLine = State<Field>();
    // MT of other zkApp address
    @state(Field) zkApps = State<Field>();
    // next campaign Id
    @state(Field) nextCampaignId = State<Field>();
    @state(Field) lastRolledUpActionState = State<Field>();

    reducer = Reducer({ actionType: CampaignAction });

    events = {
        [EventEnum.CAMPAIGN_CREATED]: Field,
    };

    init() {
        super.init();
        this.ownerTreeRoot.set(DefaultLevel1Root);
        this.infoTreeRoot.set(DefaultLevel1Root);
        this.statusTreeRoot.set(DefaultLevel1Root);
        this.configTreeRoot.set(DefaultLevel1Root);
        this.lastRolledUpActionState.set(Reducer.initialActionState);
    }

    @method createCampaign(input: CreateCampaignInput) {
        this.reducer.dispatch(
            new CampaignAction({
                actionType: Field(ActionEnum.CREATE_CAMPAIGN),
                campaignId: Field(-1),
                ipfsHash: input.ipfsHash,
                owner: this.sender,
                campaignStatus: Field(StatusEnum.APPLICATION),
                committeeId: input.committeeId,
                keyId: input.keyId,
            })
        );
    }

    @method updateCampaignInfo(input: UpdateCampaignInfo) {
        // check the right campaignId
        let campaignId = input.ownerWitness.calculateIndex();

        // TODO: double check if this.sender can be manipulated
        let isOwner = this.checkCampaignOwner(
            new CheckCampaignOwnerInput({
                owner: this.sender,
                campaignId: input.campaignId,
                ownerWitness: input.ownerWitness,
            })
        );

        isOwner.assertEquals(Bool(true));

        // check only project have been created can be updated
        campaignId.assertLessThan(this.nextCampaignId.getAndRequireEquals());

        let lastRolledUpActionState =
            this.lastRolledUpActionState.getAndRequireEquals();

        // TODO: not really able to do this, check again. If both of them send at the same block
        // checking if the request have the same id already exists within the accumulator
        let { state: exists } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: lastRolledUpActionState,
            }),
            Bool,
            (state: Bool, action: CampaignAction) => {
                return action.campaignId.equals(campaignId).or(state);
            },
            // initial state
            { state: Bool(false), actionState: lastRolledUpActionState }
        );

        // if exists then don't dispatch any more
        exists.assertEquals(Bool(false));

        this.reducer.dispatch(
            new CampaignAction({
                actionType: Field(ActionEnum.UPDATE_INFO),
                campaignId: input.campaignId,
                ipfsHash: input.ipfsHash,
                owner: this.sender, // not matter
                campaignStatus: Field(-1), // not matter
                committeeId: Field(-1), // not matter
                keyId: Field(-1), // not matter
            })
        );
    }

    @method updateCampaignStatus(input: UpdateCampaignStatus) {
        // check the right campaignId
        let campaignId = input.ownerWitness.calculateIndex();

        // TODO: double check if this.sender can be manipulated
        let isOwner = this.checkCampaignOwner(
            new CheckCampaignOwnerInput({
                owner: this.sender,
                campaignId: input.campaignId,
                ownerWitness: input.ownerWitness,
            })
        );

        isOwner.assertEquals(Bool(true));

        // check only project have been created can be updated
        campaignId.assertLessThan(this.nextCampaignId.getAndRequireEquals());

        let lastRolledUpActionState =
            this.lastRolledUpActionState.getAndRequireEquals();

        // TODO: not really able to do this, check again. If both of them send at the same block
        // checking if the request have the same id already exists within the accumulator
        let { state: exists } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: lastRolledUpActionState,
            }),
            Bool,
            (state: Bool, action: CampaignAction) => {
                return action.campaignId.equals(campaignId).or(state);
            },
            // initial state
            { state: Bool(false), actionState: lastRolledUpActionState }
        );

        // if exists then don't dispatch any more
        exists.assertEquals(Bool(false));

        this.reducer.dispatch(
            new CampaignAction({
                actionType: Field(ActionEnum.UPDATE_INFO),
                campaignId: Field(-1), // not matter
                ipfsHash: IPFSHash.fromString(''), // not matter
                owner: this.sender, // not matter
                campaignStatus: input.campaignStatus,
                committeeId: Field(-1), // not matter
                keyId: Field(-1), // not matter
            })
        );
    }

    @method updateCampaignConfig(input: UpdateCampaignConfig) {
        // check the right campaignId
        let campaignId = input.ownerWitness.calculateIndex();

        // TODO: double check if this.sender can be manipulated
        let isOwner = this.checkCampaignOwner(
            new CheckCampaignOwnerInput({
                owner: this.sender,
                campaignId: input.campaignId,
                ownerWitness: input.ownerWitness,
            })
        );

        isOwner.assertEquals(Bool(true));

        // check only project have been created can be updated
        campaignId.assertLessThan(this.nextCampaignId.getAndRequireEquals());

        let lastRolledUpActionState =
            this.lastRolledUpActionState.getAndRequireEquals();

        // TODO: not really able to do this, check again. If both of them send at the same block
        // checking if the request have the same id already exists within the accumulator
        let { state: exists } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: lastRolledUpActionState,
            }),
            Bool,
            (state: Bool, action: CampaignAction) => {
                return action.campaignId.equals(campaignId).or(state);
            },
            // initial state
            { state: Bool(false), actionState: lastRolledUpActionState }
        );

        // if exists then don't dispatch any more
        exists.assertEquals(Bool(false));

        this.reducer.dispatch(
            new CampaignAction({
                actionType: Field(ActionEnum.UPDATE_INFO),
                campaignId: Field(-1), // not matter
                ipfsHash: IPFSHash.fromString(''), // not matter
                owner: this.sender, // not matter
                campaignStatus: Field(-1), // not matter
                committeeId: input.committeeId,
                keyId: input.keyId,
            })
        );
    }

    @method rollup(proof: CampaignProof) {
        proof.verify();
        let ownerTreeRoot = this.ownerTreeRoot.getAndRequireEquals();
        let infoTreeRoot = this.infoTreeRoot.getAndRequireEquals();
        let statusTreeRoot = this.statusTreeRoot.getAndRequireEquals();
        let configTreeRoot = this.configTreeRoot.getAndRequireEquals();
        let nextCampaignId = this.nextCampaignId.getAndRequireEquals();
        let lastRolledUpActionState =
            this.lastRolledUpActionState.getAndRequireEquals();

        ownerTreeRoot.assertEquals(proof.publicOutput.initialOwnerTreeRoot);
        infoTreeRoot.assertEquals(proof.publicOutput.initialInfoTreeRoot);
        statusTreeRoot.assertEquals(proof.publicOutput.initialStatusTreeRoot);
        configTreeRoot.assertEquals(proof.publicOutput.initialConfigTreeRoot);
        nextCampaignId.assertEquals(proof.publicOutput.initialNextCampaignId);
        lastRolledUpActionState.assertEquals(
            proof.publicOutput.initialLastRolledUpACtionState
        );

        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(
            proof.publicOutput.finalLastRolledUpActionState
        );

        // update on-chain state
        this.ownerTreeRoot.set(proof.publicOutput.finalOwnerTreeRoot);
        this.infoTreeRoot.set(proof.publicOutput.finalInfoTreeRoot);
        this.statusTreeRoot.set(proof.publicOutput.finalStatusTreeRoot);
        this.configTreeRoot.set(proof.publicOutput.finalConfigTreeRoot);
        this.nextCampaignId.set(proof.publicOutput.finalNextCampaignId);
        this.lastRolledUpActionState.set(
            proof.publicOutput.finalLastRolledUpActionState
        );

        this.emitEvent(
            EventEnum.CAMPAIGN_CREATED,
            proof.publicOutput.finalNextCampaignId.sub(Field(1))
        );
    }

    checkCampaignOwner(input: CheckCampaignOwnerInput): Bool {
        let isOwner = Bool(true);

        // check the right campaignId
        let campaignId = input.ownerWitness.calculateIndex();
        isOwner = campaignId.equals(input.campaignId).and(isOwner);

        // check the same on root
        let calculatedRoot = input.ownerWitness.calculateRoot(
            OwnerStorage.calculateLeaf(input.owner)
        );

        isOwner = calculatedRoot
            .equals(this.ownerTreeRoot.getAndRequireEquals())
            .and(isOwner);

        return isOwner;
    }

    checkCampaignStatus(input: CheckCampaignStatusInput): Bool {
        let isCorrect = Bool(true);

        // check the right campaignId
        let campaignId = input.statusWitness.calculateIndex();
        isCorrect = campaignId.equals(input.campaignId).and(isCorrect);

        // check the same on root
        let calculatedRoot = input.statusWitness.calculateRoot(
            input.currentStatus
        );

        isCorrect = calculatedRoot
            .equals(this.statusTreeRoot.getAndRequireEquals())
            .and(isCorrect);

        return isCorrect;
    }
}
