import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Layout } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";
import type { PropsWithChildren } from "react";
import AppFooter from "./footer";
import Sidebar from "./sidebar";
export default function RootLayout(props: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Layout style={{ minHeight: "100vh" }}>
            <Sider breakpoint="lg" collapsedWidth="0">
              <Sidebar />
            </Sider>
            <Layout>
              <Header />
              <Content
                className="!overflow-y-auto"
                style={{ background: "#fff" }}
              >
                {props.children}
              </Content>
              <AppFooter />
            </Layout>
          </Layout>
        </AntdRegistry>
      </body>
    </html>
  );
}
