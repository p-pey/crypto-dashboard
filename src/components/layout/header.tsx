"use client";
import { Layout, Typography } from "antd";

const { Header } = Layout;
const { Title } = Typography;

export default function AppHeader() {
  return (
    <Header
      style={{
        background: "#fff",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid #f0f0f0",
      }}
    >
      <Title level={4} style={{ margin: 0 }}>
        Crypto Dashboard
      </Title>
    </Header>
  );
}
