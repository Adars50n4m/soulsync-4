import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface BreakdownItemProps {
    icon: string;
    label: string;
    value: string;
    color: string;
}

const BreakdownItem = ({ icon, label, value, color }: BreakdownItemProps) => {
    return (
        <View style={styles.appStorageBreakdown}>
            <View style={[styles.breakdownIcon, { backgroundColor: `${color}15` }]}>
                <MaterialIcons name={icon as any} size={18} color={color} />
            </View>
            <Text style={styles.breakdownLabel}>{label}</Text>
            <Text style={styles.breakdownValue}>{value}</Text>
        </View>
    );
};

export default BreakdownItem;

const styles = StyleSheet.create({
    appStorageBreakdown: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 12,
    },
    breakdownIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    breakdownLabel: {
        flex: 1,
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    breakdownValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '700',
    },
});
