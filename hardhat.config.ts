import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import dotenv from 'dotenv';


dotenv.config();
const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    "zkatana-testnet": {
      url: `https://rpc.startale.com/zkatana`,
      chainId: 1261120,
      accounts: [process.env.ACCOUNT_PRIVATE_KEY as string],
    },
    "astar-testnet": {
      url: "https://evm.shibuya.astar.network",
      chainId: 81,
      gas: 10000000, // tx gas limit
      accounts: [process.env.ACCOUNT_PRIVATE_KEY as string],
    }
  },
};

export default config;


const ENDPOINT_ID: { [key: string]: number } = {
  "astar-testnet": 10210,
  "zkatana-testnet": 10220
}


task("astarWithFeeSend", "Bridge lSBY")
  .addParam('quantity', ``)
  .addParam('targetNetwork', ``)
  .setAction(async (taskArgs, hre) => {
    let signers = await hre.ethers.getSigners()
    let owner = signers[0]
    let nonce = await hre.ethers.provider.getTransactionCount(owner.address)
    let toAddress = owner.address;
    let qty = BigInt(taskArgs.quantity)

    let contractName;
    // if sending network is astar-testnet grab AstarNative contract otherwise grab Astar

    switch (taskArgs.targetNetwork) {
      case "astar-testnet":
        contractName = "AstarNative"
        break;
      case "zkatana-testnet":
        contractName = "AstarNative"
        break;
      default:
        contractName = "Astar"
        break;
    }

    
    // get remote chain id
    const remoteChainId = ENDPOINT_ID[taskArgs.targetNetwork]

    // get local contract
    const localContractInstance = await hre.ethers.getContractAt(contractName, "0xEaFAF3EDA029A62bCbE8a0C9a4549ef0fEd5a400", owner)

    // quote fee with default adapterParams
    let adapterParams = hre.ethers.solidityPacked(["uint16", "uint256"], [1, 200000])

    // convert to address to bytes32
    let toAddressBytes32 = hre.ethers.AbiCoder.defaultAbiCoder().encode(['address'], [toAddress])

    // quote send function
    let fees = await localContractInstance.estimateSendFee(remoteChainId, toAddressBytes32, qty, false, adapterParams)
    // console.log(`OFT fees[0] (wei): ${fees[0]} / (eth): ${ethers.utils.formatEther(fees[0])}`)

    let newFee
    // need to add extra value if sending from astar-testnet
    if (hre.network.name === "astar-testnet") {
      newFee = fees[0] + qty
      // console.log(`OFT fees[0] (wei): ${newFee} / (eth): ${ethers.utils.formatEther(newFee)}`)
    }

    // define min qty to receive on the destination
    let minQty = qty/BigInt(2);

    // const balance = await hre.ethers.provider.getBalance(owner.address)
    // console.log("Balance: " + balance.toString())

    const tx = await localContractInstance.sendFrom(
        owner.address,                                       // 'from' address to send tokens
        remoteChainId,                                       // remote LayerZero chainId
        toAddressBytes32,                                    // 'to' address to send tokens
        qty,                                                 // amount of tokens to send (in wei)
        minQty,                                              // min amount of tokens to send (in wei)
        {
          refundAddress: owner.address,                    // refund address (if too much message fee is sent, it gets refunded)
          zroPaymentAddress: hre.ethers.ZeroAddress, // address(0x0) if not paying in ZRO (LayerZero Token)
          adapterParams: adapterParams                     // flexible bytes array to indicate messaging adapter services
        },
        { value: hre.network.name === "astar-testnet" ? newFee : fees[0], gasLimit: 10000000, nonce: nonce++ }
        )
    
    console.log(`✅ Message Sent [${hre.network.name}] sendTokens() to OFT @ LZ chainId[${remoteChainId}] token:[${toAddress}]`)
    console.log(`* check your address [${owner.address}] on the destination chain, in the ERC20 transaction tab !"`)
  });

task("lZDOTSend", "Bridge XC20 lzDOT")
    .addParam('quantity', ``)
    .addParam('targetNetwork', ``)
    .setAction(async (taskArgs, hre) => {
        let signers = await hre.ethers.getSigners()
        let owner = signers[0]
        let nonce = await hre.ethers.provider.getTransactionCount(owner.address)
        let toAddress = owner.address;
        let qty = BigInt(taskArgs.quantity)

        let oftAddress;
        let localContractInstance;
        switch (taskArgs.targetNetwork) {
            case "astar-testnet":
                oftAddress = "0x063a11c83660501788664C22A2fA13A57FE01a89"
                localContractInstance = await hre.ethers.getContractAt("contracts/OFTWithFee.sol:OFTWithFee", "0x063a11c83660501788664C22A2fA13A57FE01a89", owner)
                break;
            case "zkatana-testnet":
                oftAddress = "0x5A35e081fc0142f5c1171EDB2eB9ceeEBE087e35"
                localContractInstance = await hre.ethers.getContractAt("contracts/OFTProxy.sol:ProxyOFTWithFee", "0x5A35e081fc0142f5c1171EDB2eB9ceeEBE087e35", owner)
                break;
            default:
                oftAddress = "0x5A35e081fc0142f5c1171EDB2eB9ceeEBE087e35"
                localContractInstance = await hre.ethers.getContractAt("contracts/OFTWithFee.sol:ProxyOFTWithFee", "0x063a11c83660501788664C22A2fA13A57FE01a89", owner)
                break;
        }

        let erc20 = await hre.ethers.getContractAt("contracts/OFTWithFee.sol:IERC20", "0xFFffFFFF00000000000000000000000000000004", owner)


        // get remote chain id
        const remoteChainId = ENDPOINT_ID[taskArgs.targetNetwork]

        // quote fee with default adapterParams
        let adapterParams = hre.ethers.solidityPacked(["uint16", "uint256"], [1, 2000000])

        // convert to address to bytes32
        let toAddressBytes32 = hre.ethers.AbiCoder.defaultAbiCoder().encode(['address'], [toAddress])

        // quote send function
        let fees = await localContractInstance.estimateSendFee(remoteChainId, toAddressBytes32, qty, false, adapterParams)


        await erc20.approve(oftAddress, qty, { gasLimit: 10000000, nonce: nonce++ })

        const tx = await localContractInstance.sendFrom(
            owner.address,                                       // 'from' address to send tokens
            remoteChainId,                                       // remote LayerZero chainId
            toAddressBytes32,                                    // 'to' address to send tokens
            qty,                                                 // amount of tokens to send (in wei)
            qty,                                              // min amount of tokens to send (in wei)
            {
                refundAddress: owner.address,                    // refund address (if too much message fee is sent, it gets refunded)
                zroPaymentAddress: hre.ethers.ZeroAddress, // address(0x0) if not paying in ZRO (LayerZero Token)
                adapterParams: adapterParams                     // flexible bytes array to indicate messaging adapter services
            },
            { value: fees[0], gasLimit: 10000000, nonce: nonce++ }
        )

        console.log(`✅ Message Sent [${hre.network.name}] sendTokens() to OFT @ LZ chainId[${remoteChainId}] token:[${toAddress}]`)
        console.log(`* check your address [${owner.address}] on the destination chain, in the ERC20 transaction tab !"`)
    });