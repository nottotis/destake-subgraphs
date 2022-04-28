import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts"
import {
  Destake,
  GRTDeposited,
  DelegationAddressAdded,
  DelegationAddressRemoved
} from "../generated/Destake/Destake"
import {
  ERC20,
  Transfer
} from "../generated/ERC20/ERC20"
import {
  AllocationClosed, GraphStaking
} from "../generated/GraphStaking/GraphStaking"
import { 
  User,
  Balance,
  BlockBalance,
  TokenStatus,
  DelegationAddress,
  StakingBalance
 } from "../generated/schema"

 import {
   ZeroAddress,
   GraphStakingAddress,
   DestakeAddress
  } from "./constants"

export function handleGRTDeposited(event: GRTDeposited): void {
  let entity = User.load(event.transaction.from.toHex());

  if(!entity){
    entity = new User(event.transaction.from.toHex());
    entity.deposited = BigInt.fromI32(0);
  }

  
  entity.deposited = entity.deposited.plus(event.params.grtAmount);
  entity.depositedBlock = event.block.number;
  entity.save();
}

export function handleTransfer(event: Transfer): void {
  let from = Balance.load(event.params.from.toHex());
  let to = Balance.load(event.params.to.toHex());
  let value = event.params.value;
  let blockNumber = event.block.number;

  if(event.params.from.toHex() == event.params.to.toHex()){
    return;
  }

  if(!from){
    from = new Balance(event.params.from.toHex());
    // from.balance = BigInt.fromI32(0);
  }
  if(!to){
    to = new Balance(event.params.to.toHex());
    // to.balance = BigInt.fromI32(0);
  }

  let fromBlockBalance = new BlockBalance(`${event.params.from.toHex()}-${from.numOfTransfer.plus(BigInt.fromI32(1))}`);

  if(from.numOfTransfer == BigInt.zero()){
    fromBlockBalance.balance = fromBlockBalance.balance.minus(value);
    fromBlockBalance.block = blockNumber;
  }else{
    let lastBalance = BlockBalance.load(`${event.params.from.toHex()}-${from.numOfTransfer}`)!;
    fromBlockBalance.balance = lastBalance.balance.minus(value);
    fromBlockBalance.block = blockNumber;
  }
  fromBlockBalance.save();
  let newFromBalanceArray = from.balance;
  newFromBalanceArray.push(fromBlockBalance.id);
  from.balance = newFromBalanceArray;

  let toBlockBalance = new BlockBalance(`${event.params.to.toHex()}-${to.numOfTransfer.plus(BigInt.fromI32(1))}`);
  if(to.numOfTransfer == BigInt.zero()){
    toBlockBalance.balance = toBlockBalance.balance.plus(value);
    toBlockBalance.block = blockNumber;
  }else{
    let lastBalance = BlockBalance.load(`${event.params.to.toHex()}-${to.numOfTransfer}`)!;
    toBlockBalance.balance = lastBalance.balance.plus(value);
    toBlockBalance.block = blockNumber;
  }
  toBlockBalance.save();
  let newToBalanceArray = to.balance;
  newToBalanceArray.push(toBlockBalance.id);
  to.balance = newToBalanceArray;

  from.numOfTransfer = from.numOfTransfer.plus(BigInt.fromI32(1));
  to.numOfTransfer = to.numOfTransfer.plus(BigInt.fromI32(1));
  from.save();
  to.save();

  // save token supply
  let zeroAddressBalanceEntity = Balance.load(ZeroAddress)!;
  let numOfTransfer = zeroAddressBalanceEntity.numOfTransfer;
  let zeroBalance = BlockBalance.load(`${ZeroAddress}-${numOfTransfer}`)!;
  let tokenStatus = TokenStatus.load(blockNumber.toString());
  if(!tokenStatus){
    tokenStatus = new TokenStatus(blockNumber.toString());
  }
  tokenStatus.tokenSupply = zeroBalance.balance.times(BigInt.fromI32(-1));
  tokenStatus.save();
}

export function handleAllocationClosed(event: AllocationClosed): void{
    // indexer, 
    // subgraphDeploymentID,
    // epoch,
    // tokens,
    // allocationID,
    // effectiveAllocation,
    // sender,
    // poi,
    // isDelegator
  const params = event.params;
  let delegationAddress = DelegationAddress.load("destake");
  if(!delegationAddress){//no addresses
    return;
  }

  const delegationAddressArray = delegationAddress.addresses;

  for(var i = 0;i<delegationAddressArray.length;i++){
    if(delegationAddressArray[i] == params.indexer){
      if((!params.isDelegator) && (params.poi != Bytes.fromI32(0))){//check if Staking._distributeRewards called
        // should check the rewards
        let stakingContract = GraphStaking.bind(Address.fromString(GraphStakingAddress));
        const delegationPool = stakingContract.delegationPools(params.indexer);
        const delegation = stakingContract.getDelegation(params.indexer,Address.fromString(DestakeAddress));

        const shares = delegation.shares;
        const poolTotalTokens = delegationPool.value4;
        const poolTotalShares = delegationPool.value5;

        const tokenBalance = poolTotalShares.div(shares.times(poolTotalTokens));


        const updatedAtBlock = delegationPool.value3;

        let stakingBalance = StakingBalance.load(params.indexer.toHexString());
        if(!stakingBalance){
          stakingBalance = new StakingBalance(params.indexer.toHexString());
        }
        let currentBalance = new BlockBalance(`${params.indexer.toHexString()}-${updatedAtBlock}`);
        currentBalance.balance = tokenBalance;
        currentBalance.block = updatedAtBlock;
        currentBalance.save();
        stakingBalance.balanceAtBlock.push(currentBalance.id);
        stakingBalance.save();

        return;
      }
    }
  }
}

export function handleDelegationAddressAdded(event: DelegationAddressAdded): void{
  let delegationAddresses = DelegationAddress.load("destake");
  if(!delegationAddresses){
    delegationAddresses = new DelegationAddress("destake");
  }
  let addresses = delegationAddresses.addresses;
  addresses.push(event.params.toBeDelegated);
  delegationAddresses.addresses = addresses;
  delegationAddresses.save();
}

export function handleDelegationAddressRemoved(event: DelegationAddressRemoved): void{
  let delegationAddress = DelegationAddress.load("destake");
  if(!delegationAddress){
    delegationAddress = new DelegationAddress("destake");
  }
  let idx = delegationAddress.addresses.indexOf(event.params.toBeRemoved);
  delegationAddress.addresses = delegationAddress.addresses.splice(idx);
  delegationAddress.save();
}