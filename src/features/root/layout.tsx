import { Layout } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import type { PropsWithChildren } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import Sidebar from "./sidebar";
import AppFooter from "./footer";
import Sider from "antd/es/layout/Sider";
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
                style={{ margin: "16px", padding: "16px", background: "#fff" }}
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
