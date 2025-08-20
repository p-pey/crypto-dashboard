import { Layout } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";
import type { PropsWithChildren } from "react";
import {
  contentStyle,
  headerStyle,
  layoutStyle,
  siderStyle,
} from "./styles/style";

export default function RootLayout(props: PropsWithChildren) {
  return (
    <Layout style={layoutStyle}>
      <Sider width="25%" style={siderStyle}>
        Sider
      </Sider>
      <Layout>
        <Header style={headerStyle}>Header</Header>
        <Content style={contentStyle}>{props.children}</Content>
      </Layout>
    </Layout>
  );
}
