package adminapi

import (
	"context"
	"encoding/json"

	"github.com/segmentio/kafka-go"
)

// KafkaPublisher is a light wrapper over kafka-go writer for admin API analytics events.
type KafkaPublisher struct {
	Enabled bool
	Writer  *kafka.Writer
}

func NewKafkaPublisher(brokers []string, timeoutMs int, enabled bool) *KafkaPublisher {
	if !enabled || len(brokers) == 0 {
		return &KafkaPublisher{Enabled: false}
	}
	cfg := kafka.WriterConfig{
		Brokers:  brokers,
		BatchSize: 100,
		Async:    true,
	}
	if timeoutMs <= 0 {
		timeoutMs = 3000
	}
	return &KafkaPublisher{
		Enabled: true,
		Writer: kafka.NewWriter(cfg),
	}
}

func (p *KafkaPublisher) Publish(ctx context.Context, topic, key string, value interface{}) error {
	if p == nil || !p.Enabled || p.Writer == nil {
		return nil
	}
	payload, _ := json.Marshal(value)
	if ctx == nil {
		ctx = context.Background()
	}
	return p.Writer.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: payload,
	})
}

func (p *KafkaPublisher) Close() error {
	if p == nil || p.Writer == nil {
		return nil
	}
	return p.Writer.Close()
}
