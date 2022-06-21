# Transit Gateway with A Simulated On-Premises Data Center 


## Architecture 

![aws_devops-Expriment drawio (1)](https://user-images.githubusercontent.com/20411077/174434954-d3d3084e-3061-48cb-8786-65a727689acd.png)



Customers  
- [TREND MICRO](https://aws.amazon.com/transit-gateway/customers/)

When to use/use cases? 
- [A central hub which connects many VPCs](https://aws.amazon.com/transit-gateway/?whats-new-cards.sort-by=item.additionalFields.postDateTime&whats-new-cards.sort-order=desc)
- [Inter-region peering](https://aws.amazon.com/transit-gateway/?whats-new-cards.sort-by=item.additionalFields.postDateTime&whats-new-cards.sort-order=desc)
- VPN - Customer Gateway 
- [Direct Connect - Direct Connect GW - TGW](https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-direct-connect-aws-transit-gateway.html) Transit VIF 
- [Direct Connect - TGW](https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-direct-connect-aws-transit-gateway-vpn.html) Public VIF (VPN)

Best practices 
- [Quota](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-quotas.html#bandwidth-quotas): 5000 attachments, 50Gbps per VPC attachment, and ...
- [Direct connection location](https://aws.amazon.com/directconnect/locations/)
- [docs aws](https://docs.aws.amazon.com/) **RECOMMENDED**
- [TGW FAQ](https://aws.amazon.com/transit-gateway/faqs/)

Essential Concepts
- [TGW attachment, association, propogation, route table](https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html)
- [TGW VPC attachment](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html)
- [TGW VPN attachment](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpn-attachments.html)
- [TGW peering attachment](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-peering-scenario.html)
- [BGP](https://www.cloudflare.com/learning/security/glossary/what-is-bgp/)
- [Quota](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-quotas.html)


## Deploy Order 
#### Step 1. Crean an AWS base network 
```bash 
cdk deploy AwsBaseNetwork
```
#### Step 2. Create a simulated on-prem (place-holder) [HERE](https://aws.amazon.com/blogs/networking-and-content-delivery/simulating-site-to-site-vpn-customer-gateways-strongswan/)
```
cdk deploy SimulatedOnPrem
```
```bash
take note the EIP for step 3 (customer gateway)
```

#### Step 3. Transit Gateway, Customer Gateway, VPN Connection
```
cdk deploy TgwAndVpnAndCgw
```
Download the configuration (generic) from AWS VPN Site-to-Site. Take note params for step 4. 

**template-parameters-psk-auth.json** 
```json 
{
    "ParameterKey": "pAuthType",
    "ParameterValue": "psk"
  },
  {
    "ParameterKey": "pTunnel1PskSecretName",
    "ParameterValue": "pTunnel1PskSecretName"
  },
  {
    "ParameterKey": "pTunnel1VgwOutsideIpAddress",
    "ParameterValue": "34.227.182.74"
  },
  {
    "ParameterKey": "pTunnel1CgwInsideIpAddress",
    "ParameterValue": "169.254.86.242/30"
  },
  {
    "ParameterKey": "pTunnel1VgwInsideIpAddress",
    "ParameterValue": "169.254.86.241/30"
  },
  {
    "ParameterKey": "pTunnel1VgwBgpAsn",
    "ParameterValue": "65001"
  },
  {
    "ParameterKey": "pTunnel1BgpNeighborIpAddress",
    "ParameterValue": "169.254.86.241"
  },
```

```bash
create 2 secrete keys for psk
```

#### Step 4. Deploy the Simulated On-Prem with StrongSwan 

```bash 
./manage-stack -s vpn-gateway-1 --region us-east-1 template-parameters-psk-auth.json
```


#### Step 5. Update TGW Routes, VPC Subnet Routes

Option 1. By code 
```bash
cdk deploy TgwRouteAttachment
```

Option 2. By hands 
```bash 
create TGW attachment for VPC, VPN
```
```bash 
check the default TGW route table 
```
```bash 
update subnet route tables for VPCs 
```

## Step 1-2. AWS Base Network Stack 
vpc for development department 
```tsx
 // vpc-ec2 for dev development
    this.developmentVpc = new VpcWithEc2(this, "Development", {
      prefix: "Development",
      cidr: cfnParams[this.region].DevelopmentCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });
```
vpc for production department 
```tsx
 // vpc-ec2 prod department
    this.productionVpc = new VpcWithEc2(this, "Production", {
      prefix: "Production",
      cidr: cfnParams[this.region].ProductionCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });
```

simulated on-premise (place-holder)
```tsx
// simulated on-premise place-holder
new SimulatedOnPrem(app, "SimulatedOnPrem", {
  prefix: "OnPrem-",
  cidr: cfnParams[REGION].OnPremCidr,
  cidrMask: cfnParams[REGION].CidrMask,
  env: {
    region: REGION,
  },
});
```

## Step 3. Transit Gateway, Customer Gateway, VPN Connection 
create a TGW 
```tsx 
// create an TGW
    this.cfnTransitGateway = new aws_ec2.CfnTransitGateway(
      this,
      props.prefix!.concat("-TGW").toString(),
      {
        amazonSideAsn: props.amazonSideAsn,
        description: "TGW for hybrid networking",
        autoAcceptSharedAttachments: "enable",
        defaultRouteTableAssociation: "enable",
        defaultRouteTablePropagation: "enable",
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
```
create a customer gateway 
```tsx
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
```
create a vpn connection 
```tsx
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
```

## Step 4. Deploy the Simulated On-Prem with StrongSwan 
```bash
create 2 secret keys for psk 
```
```bash
update template-parameters-psk-auth.json
```
run 
```bash
./manage-stack -s vpn-gateway-1 --region us-east-1 template-parameters-psk-auth.json
```
wait and check both tunnel UP
```bash 
sudo strongswan status
```

## Step 5.1 Transit Gateway Routes, Attachments 
create a tgw route table
```tsx
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
```
create development tgw-development-vpc-attachment
```tsx
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
```
create development tgw-production-vpc-attachment
```tsx
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
```
development-vpc-attachment and tgw-table association
```tsx
const tgwDevVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "dev-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
        }
      );
```
production-vpc-attachment and tgw-table association
```tsx
const tgwProdVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "prod-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
        }
      );
```

dev-vpc-attachment tgw-propogation
```tsx
// dev-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "dev-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
      }
    );
```
prod-vpc-attachment tgw-propogation
```tsx
 // prod-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "prod-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
      }
    );
```

## Step 5.2 VPC Subnet Routes Update 
development vpc subnets route update
```tsx
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
```
production vpc subnets route update
```tsx
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
```
on-prem vpc same 
```tsx

```

## Check and Troubleshooting 
from an EC2 in the simulated on-prem ping VPCs
```bash
ping 
```
from an EC2 in a VPC ping other VPCs and on-prem
```bash
ping 
```
on the strongswan instance 
```bash
sudo tcpdump -eni any icmp
```
optionally
```bash
Reachability Analyzer Path 
```