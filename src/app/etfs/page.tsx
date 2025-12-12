"use client";
import { Col, Row, Skeleton } from "antd";
import { useState } from "react";
import EtfCoins from "~/features/etf/EtfCoins";
import EtfList from "~/features/etf/EtfList";
import { api } from "~/trpc/react";

export default function Etfs() {
  const [] = useState();
  const { data: etfs = [], isLoading } = api.etf.getEtf.useQuery({
    symbol: "BTC",
  });
  const handleEtfChange = () => {};

  return (
    <Skeleton round loading={isLoading} active>
      <Row>
        <EtfCoins />
      </Row>
      <Row className="gap-4">
        {etfs.map((etf) => (
          <Col key={etf.etf.id} span={4}>
            <EtfList data={etf.data} />
          </Col>
        ))}
      </Row>
    </Skeleton>
  );
}
