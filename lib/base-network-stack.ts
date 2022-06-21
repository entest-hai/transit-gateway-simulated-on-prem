import { aws_ec2, aws_iam, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as config from "./../params.json";
import { SimulatedOnPrem } from "./simulated-on-prem";

const cfnParams: Record<string, any> = config;

// ========================== vpc with ec2 ==========================
export interface VpcWithEc2Props {
  readonly prefix?: string;
  readonly cidr?: string;
  readonly cidrMask?: number;
  readonly transitGateway?: aws_ec2.CfnTransitGateway;
  readonly ec2Role?: aws_iam.IRole;
}

export class VpcWithEc2 extends Construct {
  public readonly vpc: aws_ec2.Vpc;
  public readonly securityGroup: aws_ec2.SecurityGroup;
  public readonly subnetIds: string[] = [];

  constructor(scope: Construct, id: string, props: VpcWithEc2Props = {}) {
    super(scope, id);

    // vpc with isolated subnet
    this.vpc = new aws_ec2.Vpc(this, props.prefix!.concat("-VPC").toString(), {
      vpcName: props.prefix!.concat("-VPC"),
      cidr: props.cidr,
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: props.cidrMask,
          name: props.prefix!.concat("-VPC | ISOLATED"),
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // populate subnets ids
    this.vpc.isolatedSubnets.forEach((subnet) =>
      this.subnetIds.push(subnet.subnetId)
    );

    // security group for ec2
    this.securityGroup = new aws_ec2.SecurityGroup(
      this,
      props.prefix!.concat("-SG").toString(),
      {
        vpc: this.vpc,
        description: "Allow ICMP ping and HTTPS",
      }
    );

    // allow inbound ICMP ping
    this.securityGroup.addIngressRule(
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.allIcmp(),
      "Allow ICMP"
    );

    // vpc endpoints ssm (3 needed)
    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-SSM").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-SSM-MESSAGES").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-EC2-MESSAGES").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    // create ec2
    const ec2 = new aws_ec2.Instance(
      this,
      props.prefix!.concat("-Instance").toString(),
      {
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.T2,
          aws_ec2.InstanceSize.MICRO
        ),
        role: props.ec2Role,
        securityGroup: this.securityGroup,
        vpc: this.vpc,
        machineImage: new aws_ec2.AmazonLinuxImage({
          cpuType: aws_ec2.AmazonLinuxCpuType.X86_64,
          generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
      }
    );

    ec2.node.addDependency(this.vpc);

    // output vpcid
    new CfnOutput(this, props.prefix!.concat("-VPCId").toString(), {
      description: "VPCId for the evironemt",
      exportName: props.prefix!.concat("VPCId").toString(),
      value: this.vpc.vpcId,
    });
  }
}

// ============================ aws base network ===========================
export class BaseNetworkStack extends Stack {
  public readonly developmentVpc: VpcWithEc2;
  public readonly productionVpc: VpcWithEc2;
  public readonly ec2Role: aws_iam.IRole;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ec2 role
    this.ec2Role = new aws_iam.Role(this, "svcRoleForEc2ViaSsm", {
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Service role for EC2 access via SSM session manager",
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMPatchAssociation"
        ),
      ],
    });

    // vpc-ec2 for dev development
    this.developmentVpc = new VpcWithEc2(this, "Development", {
      prefix: "Development",
      cidr: cfnParams[this.region].DevelopmentCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });

    // vpc-ec2 prod department
    this.productionVpc = new VpcWithEc2(this, "Production", {
      prefix: "Production",
      cidr: cfnParams[this.region].ProductionCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });

    // vpc-ec2 simulated on-prem place holder
    new SimulatedOnPrem(this, "OnPrem", {
      ec2Role: this.ec2Role,
      prefix: "OnPrem",
      cidr: cfnParams[this.region].OnPremCidr,
      cidrMask: cfnParams[this.region].CidrMask,
    });
  }
}
