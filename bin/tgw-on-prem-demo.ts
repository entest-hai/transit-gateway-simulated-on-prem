import { App } from "aws-cdk-lib";
import { BaseNetworkStack } from "../lib/base-network-stack";
import { SimulatedOnPrem } from "../lib/simulated-on-prem";
import { Gateway, TgwRouteAttachment } from "../lib/transit-gateway-routes";
import * as config from "../params.json";

const cfnParams: Record<string, any> = config;

// region to deploy
const REGION = "us-east-1";

// create an app
const app = new App();

// step 1. aws based network
const baseNetwork = new BaseNetworkStack(app, "AwsBaseNetwork", {
  env: {
    region: REGION,
  },
  description: "Builds the base resources for the TGW",
});

// step 2. tgw, cgw, vpn-connection
const gateway = new Gateway(app, "TgwAndVpnAndCgw", {
  prefix: "TGW-",
  amazonSideAsn: cfnParams[REGION].AmazonSideAsn,
  onPremIpAddress: cfnParams["OnPremPublicIp"],
  customerSideAsn: cfnParams[REGION].CustomerSideAsn,
  env: {
    region: REGION,
  },
});

// step 3. tgw route table, tgw-attachments, vpc-subnet-routing
new TgwRouteAttachment(app, "TgwRouteAttachment", {
  prefix: "Gateway-",
  transitGateway: gateway.cfnTransitGateway,
  developmentVpc: baseNetwork.developmentVpc.vpc,
  productionVpc: baseNetwork.productionVpc.vpc,
  env: {
    region: REGION,
  },
});