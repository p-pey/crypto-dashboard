"use client";
import { Avatar, Card, Col, Row, Typography } from "antd";
import { Sparklines, SparklinesLine } from "react-sparklines";

const { Title, Text } = Typography;

export default function EtfList({ data }: { data: any }) {
  const meta = data.chart.result[0].meta;
  const timestamps = data.chart.result[0].timestamp;
  const prices = data.chart.result[0].indicators.quote[0].low ?? [];
  // Filter nulls and keep sparkline clean
  const cleanPrices = prices.filter((n: any) => n !== null);

  const isBullish = meta.chartPreviousClose <= meta.regularMarketDayHigh;

  return (
    <Card className="h-[350px] !rounded-2xl border border-black !bg-transparent p-4 shadow-lg">
      <Row justify="center" align="middle" className="gap-4">
        <Col>
          <Row align="middle" justify="space-between" gutter={12} wrap={false}>
            <Avatar
              shape="circle"
              size={48}
              src={`https://logo.clearbit.com/nyse.com`}
            />
            <Col>
              <Title
                className="!font-bold !text-black"
                level={4}
                style={{ margin: 0 }}
              >
                {meta.symbol}
              </Title>
              <Text type="secondary">{meta.longName}</Text>
            </Col>
          </Row>
        </Col>

        <Col className="mx-auto text-center">
          <Row justify="center" className="!m-0 !p-0">
            <Title level={2} className="!m-0 !font-bold !text-black">
              ${meta.regularMarketPrice.toFixed(2)}
            </Title>
            <Typography className="font-bold !text-black">m</Typography>
          </Row>
        </Col>
      </Row>

      <Row style={{ marginTop: 20 }}>
        <Col span={24}>
          <Sparklines data={cleanPrices} height={60}>
            <SparklinesLine
              style={{
                strokeWidth: 2,
                stroke: isBullish ? "#3f8600" : "red",
                fill: "none",
              }}
            />
          </Sparklines>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Text className="!text-black" strong>
            Day High:
          </Text>
          <br />
          <Text className="!text-black">${meta.regularMarketDayHigh}</Text>
        </Col>
        <Col span={8}>
          <Text className="!text-black" strong>
            Day Low:
          </Text>
          <br />
          <Text className="!text-black">${meta.regularMarketDayLow}</Text>
        </Col>
        <Col span={8}>
          <Text className="!text-black" strong>
            Volume:
          </Text>
          <br />
          <Text className="!text-black">
            {meta.regularMarketVolume.toLocaleString()}
          </Text>
        </Col>
      </Row>
    </Card>
  );
}
