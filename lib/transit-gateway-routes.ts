import { aws_ec2, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { v4 as uuidv4 } from "uuid";

// ========================== Transit Gateway ==========================
interface GatewayProps extends StackProps {
  prefix?: string;
  amazonSideAsn?: number;
  onPremIpAddress?: string;
  customerSideAsn?: number;
}

export class Gateway extends Stack {
  public readonly cfnTransitGateway: aws_ec2.CfnTransitGateway;
  public readonly cfnCustomerGateway: aws_ec2.CfnCustomerGateway;
  public readonly cfnVPNConnection: aws_ec2.CfnVPNConnection;

  constructor(scope: Construct, id: string, props: GatewayProps) {
    super(scope, id, props);

    // create an TGW
      this.cfnTransitGateway = new aws_ec2.CfnTransitGateway(
        this,
        props.prefix!.concat("-TGW").toString(),
        {
          amazonSideAsn: props.amazonSideAsn,
          description: "TGW for hybrid networking",
          autoAcceptSharedAttachments: "enable",
          defaultRouteTableAssociation: "disable",
          defaultRouteTablePropagation: "disable",
          dnsSupport: "enable",
          vpnEcmpSupport: "enable",
          multicastSupport: "enable",
          tags: [
            {
              key: "Name",
              value: props.prefix!.concat("-TGW").toString(),
            },
          ],
        }
      );

    // create a customer gateway
    this.cfnCustomerGateway = new aws_ec2.CfnCustomerGateway(
      this,
      props.prefix!.concat("-CGW").toString(),
      {
        bgpAsn: props.customerSideAsn!,
        ipAddress: props.onPremIpAddress!,
        type: "ipsec.1",
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-CGW").toString(),
          },
        ],
      }
    );

    // create the site-to-site VPN connection
    this.cfnVPNConnection = new aws_ec2.CfnVPNConnection(
      this,
      props.prefix!.concat("-VPN").toString(),
      {
        transitGatewayId: this.cfnTransitGateway.ref,
        customerGatewayId: this.cfnCustomerGateway.ref,
        staticRoutesOnly: false,
        type: "ipsec.1",
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-VPN").toString(),
          },
        ],
      }
    );

    // outputs
      new CfnOutput(this, "transitGatewayId", {
        description: "Transit Gateway ID",
        exportName: "TransitGatewayId",
        value: this.cfnTransitGateway.ref,
      });

    new CfnOutput(this, "customerGatewayId", {
      description: "Customer Gateway ID",
      exportName: "CustomerGatewayId",
      value: this.cfnCustomerGateway.ref,
    });

    new CfnOutput(this, "vpnConnectionId", {
      description: "VPN Connection ID",
      exportName: "VPNConnectionId",
      value: this.cfnVPNConnection.ref,
    });
  }
}

// ========================== vpc subnet routing ==========================
export interface SubnetRoutingProps {
  readonly prefix?: string;
  readonly vpc?: aws_ec2.IVpc;
  readonly transitGateway?: aws_ec2.CfnTransitGateway;
}

export class SubnetRouting extends Construct {
  constructor(scope: Construct, id: string, props: SubnetRoutingProps = {}) {
    super(scope, id);

    // add routing to vpc subnets
    for (var subnet of props.vpc!.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(
        this,
        props.prefix!.concat(uuidv4()).concat("-tgw-route").toString(),
        {
          destinationCidrBlock: "0.0.0.0/0",
          routeTableId: subnet.routeTable.routeTableId,
          transitGatewayId: props.transitGateway!.ref,
        }
      );
      route.addDependsOn(props.transitGateway!);
    }
  }
}

// ========================== tgw routes & attachment ==========================
interface TgwRouteAttachmentProps extends StackProps {
  prefix: string;
  transitGateway: aws_ec2.CfnTransitGateway;
  developmentVpc: aws_ec2.Vpc;
  productionVpc: aws_ec2.Vpc;
}

export class TgwRouteAttachment extends Stack {
  public readonly cfnTransitGatewayRouteTable: aws_ec2.CfnTransitGatewayRouteTable;

  constructor(scope: Construct, id: string, props: TgwRouteAttachmentProps) {
    super(scope, id, props);

    // tgw route table
    this.cfnTransitGatewayRouteTable = new aws_ec2.CfnTransitGatewayRouteTable(
      this,
      props.prefix!.concat("-RouteTable").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-RouteTable").toString(),
          },
        ],
      }
    );

    // create development tgw-development-vpc-attachment
    const tgwDevVpcAttachment = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      props.prefix!.concat("dev-vpc-tgw-attachment").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        vpcId: props.developmentVpc.vpcId,
        subnetIds: props.developmentVpc.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("dev-vpc-tgw-attachment").toString(),
          },
        ],
      }
    );

    // create development tgw-production-vpc-attachment
    const tgwProdVpcAttachment = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      props.prefix!.concat("prod-vpc-tgw-attachment").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        vpcId: props.productionVpc.vpcId,
        subnetIds: props.productionVpc.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("prod-vpc-tgw-attachment").toString(),
          },
        ],
      }
    );

    // development-vpc-attachment and tgw-table association
    const tgwDevVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "dev-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
        }
      );

    // production-vpc-attachment and tgw-table association
    const tgwProdVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "prod-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
        }
      );

    // dev-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "dev-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
      }
    );

    // prod-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "prod-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
      }
    );

    // development vpc subnets route update
    for (var subnet of props.developmentVpc.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToProdVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.productionVpc.vpcCidrBlock,
        transitGatewayId: props.transitGateway.ref,
      });
      // route.addDependsOn(vpcDevTgwAttach);
      route.addDependsOn(tgwDevVpcAttachment);
    }

    // production vpc subnets route update
    for (var subnet of props.productionVpc.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToDevVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.developmentVpc.vpcCidrBlock,
        transitGatewayId: props.transitGateway.ref,
      });
      // route.addDependsOn(vpcDevTgwAttach);
      route.addDependsOn(tgwDevVpcAttachment);
    }
  }
}

interface TgwVpnRoutingProps extends StackProps {
  transitGateway: aws_ec2.CfnTransitGateway;
  vpcRouteTableId: string;
  devAttachmentId: string;
  prodAttachmentId: string;
  vpnAttachmentId: string;
}

export class TgwVpnRouting extends Stack {
  constructor(scope: Construct, id: string, props: TgwVpnRoutingProps) {
    super(scope, id, props);

    // create the routing table association and propogation for TGW-VPN
    const vpnTransitGatewayRTB = new aws_ec2.CfnTransitGatewayRouteTable(
      this,
      "VPN",
      {
        transitGatewayId: props.transitGateway.ref,
        tags: [
          {
            key: "Name",
            value: "VPNRouteTable",
          },
        ],
      }
    );

    // tgw vpn association
    new aws_ec2.CfnTransitGatewayRouteTableAssociation(this, "VPNAssociation", {
      transitGatewayAttachmentId: props.vpnAttachmentId,
      transitGatewayRouteTableId: vpnTransitGatewayRTB.ref,
    });

    // tgw vpn propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(this, "VPNPropogation", {
      transitGatewayAttachmentId: props.vpnAttachmentId,
      transitGatewayRouteTableId: vpnTransitGatewayRTB.ref,
    });

    // propogate the vpn attachment for dev and prod TGW-VPC Routable
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "DevelopmentVPNPropagation",
      {
        transitGatewayAttachmentId: props.vpnAttachmentId,
        transitGatewayRouteTableId: props.vpcRouteTableId,
      }
    );

    // propogate dev and prod attachment with TGW-VPN RoutTable
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "VPNDevelopmentPropogation",
      {
        transitGatewayAttachmentId: props.devAttachmentId,
        transitGatewayRouteTableId: vpnTransitGatewayRTB.ref,
      }
    );

    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "VPNProductionPropogation",
      {
        transitGatewayAttachmentId: props.prodAttachmentId,
        transitGatewayRouteTableId: vpnTransitGatewayRTB.ref,
      }
    );
  }
}
