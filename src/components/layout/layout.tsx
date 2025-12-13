import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Layout } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";
import type { PropsWithChildren } from "react";
import AppFooter from "./footer";
import Sidebar from "./sidebar";
import AppStyle from "./styles/app.module.css";
export default function RootLayout(props: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Layout style={{ height: "100vh", padding: "4px", background: "#B6AE9F", gap: "4px" }}>
            <Sider
              breakpoint="lg"
              collapsedWidth="0"
              className={AppStyle.sider}
            >
              <Sidebar />
            </Sider>
            <Layout>
              <Header className={AppStyle.Header} />
              <Content
                className="!overflow-y-auto"
                style={{ background: "#B6AE9F", padding: "8px",  }}
              >
                <div className={AppStyle.ContentWrapper}>{props.children}</div>
              </Content>
              <AppFooter />
            </Layout>
          </Layout>
        </AntdRegistry>
      </body>
    </html>
  );
}
