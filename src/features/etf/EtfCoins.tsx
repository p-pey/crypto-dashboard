import { Col, Select } from "antd";
import Title from "antd/es/typography/Title";

export default function EtfCoins() {
  return (
    <>
      <Col span={24}>
        <Title>Daily Etf's Flow</Title>
      </Col>
      <Col span={24}>
        <Select value={"btc"} style={{ width: "250px" }}>
          <Select.Option key="btc">Bitcoin ( BTC )</Select.Option>
          <Select.Option>Ethereum ( ETH )</Select.Option>
          <Select.Option>Solana ( SOL )</Select.Option>
          <Select.Option>Ripple ( XRP )</Select.Option>
          <Select.Option>Lite Coin ( LTC )</Select.Option>
          <Select.Option>Doge Coin ( Doge )</Select.Option>
        </Select>
      </Col>
    </>
  );
}
