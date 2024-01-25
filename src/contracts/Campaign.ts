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
    ConfigStorage,
    OwnerStorage,
    InfoStorage,
} from './CampaignStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class CampaignAction extends Struct({
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

export class CheckCampaignOwerInput extends Struct({
    owner: PublicKey,
    campaignId: Field,
    ownerWitness: Level1Witness,
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

export class UpdateCampaignInput extends Struct({}) {
    static fromFields(fields: Field[]): UpdateCampaignInput {
        return super.fromFields(fields) as UpdateCampaignInput;
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
                infoWitess: Level1Witness,
                statusWitess: Level1Witness,
                configWitess: Level1Witness
            ): CreateCampaignProofOutput {
                preProof.verify();

                // check if this action is create campaign
                newAction.campaignId.assertEquals(Field(-1));

                let newCampaignId = preProof.publicOutput.finalNextCampaignId;

                ////// caculate new ownerTreeRoot
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

                ////// caculate in infoTreeRoot
                let preInfoRoot = infoWitess.calculateRoot(Field(0));
                let infoIndex = infoWitess.calculateIndex();
                infoIndex.assertEquals(newCampaignId);
                preInfoRoot.assertEquals(
                    preProof.publicOutput.finalInfoTreeRoot
                );

                // update infoTreeRoot
                let newInfoTreeRoot = infoWitess.calculateRoot(
                    InfoStorage.calculateLeaf(newAction.ipfsHash)
                );

                ////// caculate in infoTreeRoot
                let preStatusRoot = statusWitess.calculateRoot(Field(0));
                let statusIndex = statusWitess.calculateIndex();
                statusIndex.assertEquals(newCampaignId);
                preStatusRoot.assertEquals(
                    preProof.publicOutput.finalStatusTreeRoot
                );

                // update infoTreeRoot
                let newStatusTreeRoot = statusWitess.calculateRoot(
                    newAction.campaignStatus
                );

                ////// caculate in configTreeRoot
                let preConfigRoot = configWitess.calculateRoot(Field(0));
                let configIndex = configWitess.calculateIndex();
                configIndex.assertEquals(newCampaignId);
                preConfigRoot.assertEquals(
                    preProof.publicOutput.finalConfigTreeRoot
                );

                // update infoTreeRoot
                let newConfigTreeRoot = configWitess.calculateRoot(
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
    },
});

class CampaignProof extends ZkProgram.Proof(CreateCampaign) {}

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
                campaignId: Field(-1),
                ipfsHash: input.ipfsHash,
                owner: this.sender,
                campaignStatus: Field(StatusEnum.APPLICATION),
                committeeId: input.committeeId,
                keyId: input.keyId,
            })
        );
    }

    // TODO
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    @method updateCampaignInfo(input: UpdateCampaignInput) {}

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
        this.lastRolledUpActionState.set(
            proof.publicOutput.finalLastRolledUpActionState
        );

        this.emitEvent(
            EventEnum.CAMPAIGN_CREATED,
            proof.publicOutput.finalNextCampaignId.sub(Field(1))
        );
    }

    // TODO
    @method checkCampaignOwner(input: CheckCampaignOwerInput): Bool {
        let isOwner = Bool(true);

        return isOwner;
    }
}
